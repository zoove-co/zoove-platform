import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MenuRow } from '@/components/account/MenuRow';
import { AppText } from '@/components/ui/AppText';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { colors, spacing } from '@/theme';

const ITEMS = ['booking', 'cancellation', 'privacy', 'terms'] as const;

// The policy texts are not written yet (open question 25). Each row opens the placeholder until they are.
export default function PoliciesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('policies.title')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('policies.heading')}</AppText>
        {ITEMS.map((key) => (
          <MenuRow
            key={key}
            icon="shield-checkmark-outline"
            label={t(`policies.${key}`)}
            onPress={() => router.push({ pathname: '/soon', params: { title: t(`policies.${key}`) } })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
});
