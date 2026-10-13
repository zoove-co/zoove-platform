import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useRequestOtp, useVerifyOtp } from '@/features/auth/hooks';
import { track } from '@/lib/analytics/track';
import { authErrorMessage } from '@/lib/api/errorMessage';
import { useAuth } from '@/lib/auth/useAuth';
import { colors, fonts, radius, spacing } from '@/theme';

const LENGTH = 6;

const formatPhone = (e164: string) => `${e164.slice(0, 3)} ${e164.slice(3, 8)} ${e164.slice(8)}`;

export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { phone, resend } = useLocalSearchParams<{ phone?: string; resend?: string }>();
  const status = useAuth((state) => state.status);
  const signIn = useAuth((state) => state.signIn);
  const verify = useVerifyOtp();
  const requestOtp = useRequestOtp();

  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(() => {
    const parsed = Number(resend);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Once the session exists, move on. Doing it here (not right after signIn) lets the router
  // see the new signed-in state before it navigates to a protected screen.
  useEffect(() => {
    if (status === 'signedIn') router.replace('/home');
  }, [status, router]);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  if (!phone) return <Redirect href="/" />;

  const submit = (value: string) => {
    if (verify.isPending) return;
    setError(null);
    verify.mutate(
      { phone, code: value },
      {
        onSuccess: (result) => {
          track('otp_verified', { is_new_user: result.isNewUser });
          void signIn(result.token);
        },
        onError: (err) => {
          setError(authErrorMessage(err, t));
          setCode('');
          inputRef.current?.focus();
        },
      },
    );
  };

  const onChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === LENGTH) submit(digits);
  };

  const onResend = () => {
    if (seconds > 0 || requestOtp.isPending) return;
    setError(null);
    setCode('');
    requestOtp.mutate(phone, {
      onSuccess: (result) => {
        track('otp_requested');
        setSeconds(result.resendAfterSeconds);
        inputRef.current?.focus();
      },
      onError: (err) => setError(authErrorMessage(err, t)),
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <View style={styles.heading}>
            <AppText variant="screenTitle" style={styles.title}>
              {t('auth.otpTitle')}
            </AppText>
            <AppText color={colors.muted} style={styles.text}>
              {t('auth.otpBody', { phone: formatPhone(phone) })}
            </AppText>
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <AppText variant="bodyStrong" color={colors.purple} style={styles.text}>
                {t('auth.otpChange')}
              </AppText>
            </Pressable>
          </View>

          <Pressable style={styles.boxes} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: LENGTH }, (_, index) => {
              const active = index === code.length && !verify.isPending;
              return (
                <View
                  key={index}
                  style={[styles.box, active && styles.boxActive, error ? styles.boxError : null]}>
                  <AppText variant="sectionTitle" style={styles.digit}>
                    {code[index] ?? ''}
                  </AppText>
                </View>
              );
            })}
            <TextInput
              ref={inputRef}
              accessibilityLabel={t('auth.otpTitle')}
              value={code}
              onChangeText={onChange}
              autoFocus
              editable={!verify.isPending}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={LENGTH}
              caretHidden
              style={styles.hiddenInput}
            />
          </Pressable>

          {error ? (
            <AppText variant="caption" color={colors.danger}>
              {error}
            </AppText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={seconds > 0 || requestOtp.isPending}
            onPress={onResend}
            hitSlop={8}
            style={styles.resend}>
            <AppText variant="bodyStrong" color={seconds > 0 ? colors.muted : colors.purple} style={styles.text}>
              {seconds > 0 ? t('auth.otpResendIn', { seconds }) : t('auth.otpResend')}
            </AppText>
          </Pressable>

          {__DEV__ ? (
            <AppText variant="micro" color={colors.muted}>
              {t('auth.devHint')}
            </AppText>
          ) : null}
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label={t('auth.verify')}
            disabled={code.length < LENGTH}
            loading={verify.isPending}
            onPress={() => submit(code)}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  heading: { gap: 8 },
  title: { fontSize: 26, lineHeight: 32 },
  text: { fontSize: 15, lineHeight: 21 },
  resend: { alignSelf: 'flex-start' },
  footer: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  boxes: { flexDirection: 'row', gap: 10, marginVertical: spacing.sm },
  box: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  boxActive: { borderColor: colors.purple, borderWidth: 1.5 },
  boxError: { borderColor: colors.danger },
  digit: { fontFamily: fonts.semibold },
  hiddenInput: { ...StyleSheet.absoluteFill, opacity: 0.01 },
});
