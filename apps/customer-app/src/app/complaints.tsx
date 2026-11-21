import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComplaintRow } from '@/components/complaints/ComplaintRow';
import { AppText } from '@/components/ui/AppText';
import { FitnessLoader } from '@/components/ui/FitnessLoader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useComplaints } from '@/features/complaints/hooks';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { colors, spacing } from '@/theme';

// Everything the customer has told us: open conversations first, then the ones that were resolved.
export default function ComplaintsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useComplaints(true);
  useRefetchOnFocus(refetch);
  const open = (id: string) => router.push({ pathname: '/complaint/[id]', params: { id } });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('complaints.title')} />
      {isPending ? (
        <View style={styles.center}><FitnessLoader fill={false} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText variant="heading">{t('complaints.loadError')}</AppText>
          <PrimaryButton label={t('complaints.retry')} variant="soft" onPress={() => void refetch()} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <PrimaryButton label={t('complaints.heading')} onPress={() => router.push('/complaint/new')} />
          {data.active.length === 0 && data.past.length === 0 ? (
            <View style={styles.empty}>
              <AppText variant="heading" style={styles.centerText}>{t('complaints.emptyTitle')}</AppText>
              <AppText color={colors.muted} style={styles.centerText}>{t('complaints.emptyBody')}</AppText>
            </View>
          ) : null}
          {data.active.length > 0 ? <AppText variant="bodyStrong">{t('complaints.active')}</AppText> : null}
          {data.active.map((item) => <ComplaintRow key={item.id} item={item} onPress={() => open(item.id)} />)}
          {data.past.length > 0 ? <AppText variant="bodyStrong" style={styles.gap}>{t('complaints.past')}</AppText> : null}
          {data.past.map((item) => <ComplaintRow key={item.id} item={item} onPress={() => open(item.id)} />)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  gap: { marginTop: spacing.md },
});
