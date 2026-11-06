import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  type TextStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/Wordmark';
import { AppText } from '@/components/ui/AppText';
import { Checkbox } from '@/components/ui/Checkbox';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useRequestOtp } from '@/features/auth/hooks';
import { track } from '@/lib/analytics/track';
import { ApiError } from '@/lib/api';
import { authErrorMessage } from '@/lib/api/errorMessage';
import { useAuth } from '@/lib/auth/useAuth';
import { colors, fonts, radius, spacing } from '@/theme';

export default function WelcomeScreen() {
  const status = useAuth((state) => state.status);
  // A returning customer goes straight to Home: no login, no animation to sit through.
  if (status === 'signedIn') return <Redirect href="/home" />;
  return <Welcome />;
}

function Welcome() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requestOtp = useRequestOtp();

  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [focused, setFocused] = useState(false);
  // The sheet's own height, measured once, so the logo can start in the middle of the screen
  // and settle in the middle of what is left above the sheet on any screen size.
  const [sheetHeight, setSheetHeight] = useState(0);
  const [logoIn] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (sheetHeight === 0) return;
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.spring(logoIn, { toValue: 1, friction: 6, tension: 60, useNativeDriver: native }),
      Animated.delay(550),
      Animated.timing(lift, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: native,
      }),
    ]).start();
  }, [sheetHeight, logoIn, lift]);

  const address = email.trim().toLowerCase();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) && address.length <= 200;
  const showError = touched && !valid && email.length > 0;

  const goToOtp = (resend: number, to: string) =>
    router.push({ pathname: '/otp', params: { email: to, resend: String(resend), agreed: agreed ? '1' : '0' } });

  const submit = () => {
    setTouched(true);
    if (!valid || !agreed || requestOtp.isPending) return;
    requestOtp.mutate(address, {
      onSuccess: (result) => {
        track('otp_requested');
        goToOtp(result.resendAfterSeconds, address);
      },
      onError: (error) => {
        // A code was already sent a moment ago: take the customer to the code screen instead.
        if (error instanceof ApiError && error.code === 'OTP_RATE_LIMITED') goToOtp(30, address);
      },
    });
  };

  const apiError =
    requestOtp.isError && !(requestOtp.error instanceof ApiError && requestOtp.error.code === 'OTP_RATE_LIMITED')
      ? authErrorMessage(requestOtp.error, t)
      : null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={[styles.top, { paddingTop: insets.top + spacing.xl }]}>
        <Animated.View
          style={[
            styles.logo,
            {
              opacity: logoIn,
              transform: [
                // Starts half a sheet lower (screen centre) and rises to the centre of the free space.
                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight / 2, 0] }) },
                { scale: Animated.multiply(logoIn, lift.interpolate({ inputRange: [0, 1], outputRange: [1.15, 0.9] })) },
              ],
            },
          ]}>
          <Wordmark width={230} tint={colors.white} />
          <Animated.View style={{ opacity: lift }}>
            <AppText color={colors.lavender} style={styles.tagline}>
              {t('auth.tagline')}
            </AppText>
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View
        onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
            opacity: sheetHeight === 0 ? 0 : 1,
            transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }],
          },
        ]}>
        <View style={styles.heading}>
          <AppText variant="screenTitle" style={styles.title}>
            {t('auth.welcomeTitle')}
          </AppText>
          <AppText color={colors.muted} style={styles.body}>
            {t('auth.welcomeBody')}
          </AppText>
        </View>

        <View style={styles.field}>
          <AppText variant="caption" color={colors.muted} style={styles.label}>
            {t('auth.emailLabel')}
          </AppText>
          <View
            style={[
              styles.phoneRow,
              focused && styles.phoneRowFocused,
              showError && styles.phoneRowError,
            ]}>
            <TextInput
              accessibilityLabel={t('auth.emailLabel')}
              value={email}
              onChangeText={(value) => setEmail(value.replace(/\s/g, '').slice(0, 200))}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setTouched(true);
              }}
              onSubmitEditing={submit}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor="rgba(8, 11, 15, 0.3)"
              keyboardType="email-address"
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={200}
              style={[styles.input, Platform.OS === 'web' && styles.inputWeb]}
            />
          </View>
          {showError ? (
            <AppText variant="caption" color={colors.danger}>
              {t('auth.emailError')}
            </AppText>
          ) : null}
          {apiError ? (
            <AppText variant="caption" color={colors.danger}>
              {apiError}
            </AppText>
          ) : null}
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label={t('auth.continue')}
            disabled={!valid || !agreed}
            loading={requestOtp.isPending}
            onPress={submit}
          />
          <Checkbox checked={agreed} onChange={setAgreed} label={t('auth.agreeLabel')}>
            <AppText variant="caption" color={colors.muted}>
              {t('auth.agree')}{' '}
              <AppText variant="caption" color={colors.purple} style={styles.link} onPress={() => router.push('/policies')}>
                {t('auth.terms')}
              </AppText>{' '}
              {t('auth.and')}{' '}
              <AppText variant="caption" color={colors.purple} style={styles.link} onPress={() => router.push('/policies')}>
                {t('auth.privacy')}
              </AppText>
            </AppText>
          </Checkbox>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.purple },
  top: { flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  logo: { alignItems: 'center', gap: 2 },
  tagline: { fontFamily: fonts.medium, fontSize: 15 },
  sheet: {
    gap: spacing.xl,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.white,
  },
  heading: { gap: 6 },
  title: { fontSize: 26, lineHeight: 32 },
  body: { fontSize: 15, lineHeight: 21 },
  field: { gap: 8 },
  label: { fontFamily: fonts.medium, fontSize: 12 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  phoneRowFocused: { borderColor: colors.purple, borderWidth: 1.5 },
  phoneRowError: { borderColor: colors.danger, borderWidth: 1.5 },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  inputWeb: { outlineStyle: 'none' } as unknown as TextStyle,
  actions: { gap: spacing.md },
  link: { fontFamily: fonts.bold },
});
