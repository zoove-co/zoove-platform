import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useProfile, useUpdateProfile } from '@/features/auth/hooks';
import { buildProfileSchema, type ProfileFormValues } from '@/features/auth/profileSchema';
import { track } from '@/lib/analytics/track';
import type { Profile } from '@/lib/api';
import { colors, spacing } from '@/theme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { data: profile, isPending, isError } = useProfile();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('profile.title')} />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : isError || !profile ? (
        <View style={styles.center}>
          <AppText variant="heading">{t('profile.saveError')}</AppText>
        </View>
      ) : (
        <ProfileForm profile={profile} />
      )}
    </SafeAreaView>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const router = useRouter();
  const update = useUpdateProfile();
  const firstTime = profile.firstName === null;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(buildProfileSchema((key) => t(key))),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      email: profile.email ?? '',
    },
  });

  const submit = handleSubmit((values) => {
    update.mutate(values, {
      onSuccess: () => {
        if (firstTime) track('profile_completed');
        if (router.canGoBack()) router.back();
        else router.replace('/account');
      },
    });
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TextField label={t('profile.phone')} value={profile.phone} onChangeText={() => undefined} editable={false} />
        <Controller
          control={control}
          name="firstName"
          render={({ field }) => (
            <TextField
              label={t('profile.firstName')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.firstName?.message}
              autoCapitalize="words"
              autoComplete="given-name"
            />
          )}
        />
        <Controller
          control={control}
          name="lastName"
          render={({ field }) => (
            <TextField
              label={t('profile.lastName')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="words"
              autoComplete="family-name"
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label={t('profile.email')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.email?.message}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          )}
        />
        {update.isError ? (
          <AppText variant="caption" color={colors.danger}>
            {t('profile.saveError')}
          </AppText>
        ) : null}
        <PrimaryButton label={t('profile.save')} loading={update.isPending} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  content: { padding: spacing.xl, gap: spacing.md },
});
