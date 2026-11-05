import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { POLICIES, type PolicyKey } from '@/lib/policies';
import { colors, spacing } from '@/theme';

// One policy text (terms, privacy or cancellation). The words live in lib/policies/policies.json,
// the same file that feeds the zoove.co pages, so the app and the website always match.
export default function PolicyScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const policy = POLICIES.docs[doc as PolicyKey];
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={policy?.title ?? ''} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {policy ? (
          <>
            <AppText variant="screenTitle">{policy.title}</AppText>
            <AppText variant="caption" color={colors.muted}>
              Last updated {POLICIES.updated}
            </AppText>
            <AppText>{policy.intro}</AppText>
            {policy.sections.map((s) => (
              <View key={s.heading} style={styles.block}>
                <AppText variant="bodyStrong">{s.heading}</AppText>
                {s.body.map((line) => (
                  <AppText key={line} color={colors.muted}>
                    {line}
                  </AppText>
                ))}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  block: { gap: 6, marginTop: spacing.sm },
});
