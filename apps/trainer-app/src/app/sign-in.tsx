import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { Wordmark } from '@/components/ui/Wordmark';
import { ApiError, requestCode, verifyCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/theme';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CODE_ERRORS: Record<string, string> = {
  OTP_INVALID: 'That code is not right. Check the email and try again.',
  OTP_LOCKED: 'Too many wrong tries. Ask for a new code in a few minutes.',
  OTP_RATE_LIMITED: 'You asked for too many codes. Please wait a bit and try again.',
  EMAIL_FAILED: 'We could not send the email just now. Please try again in a minute.',
  ACCOUNT_BLOCKED: 'This account cannot be used here. Please contact Zoove.',
};
const message = (err: unknown): string => (err instanceof ApiError ? (CODE_ERRORS[err.code] ?? err.message) : 'Something went wrong. Please try again.');

const NEEDS: { icon: IconName; title: string; note: string }[] = [
  { icon: 'card-outline', title: 'Aadhaar card', note: 'Front and back' },
  { icon: 'document-text-outline', title: 'PAN card', note: 'Photo or PDF' },
  { icon: 'camera-outline', title: 'A selfie', note: 'Taken with your camera' },
  { icon: 'ribbon-outline', title: 'A certificate', note: 'Yoga, fitness or training. At least one' },
];

const STEPS: [string, string][] = [
  ['Apply', 'Fill in your details and upload your documents. Save and finish later if you need to.'],
  ['We check', 'The Zoove team reviews your application and emails you the result.'],
  ['Start', 'Once you are approved, sessions near you show up in the app.'],
];

// Same email-code sign-in as the Join Zoove page. An account started on the web opens here with the same email.
export default function SignIn() {
  const insets = useSafeAreaInsets();
  const status = useAuth((state) => state.status);
  const notice = useAuth((state) => state.notice);
  const signIn = useAuth((state) => state.signIn);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  if (status === 'signedIn') return <Redirect href="/" />;

  async function send() {
    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    try {
      const result = await requestCode(address);
      setSentTo(address);
      setCode('');
      setWait(result.resendAfterSeconds);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError(null);
    try {
      await signIn(await verifyCode(sentTo, code));
      router.replace('/');
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding">
      <ScrollView style={styles.fill} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
          <View style={styles.blobBig} />
          <View style={styles.blobSmall} />
          <Wordmark width={130} />
          <AppText variant="screenTitle" style={styles.headline}>Train clients at home, across Mumbai.</AppText>
          <AppText variant="body" color={colors.ink} style={styles.sub}>Join the Zoove trainer team. Apply from your phone in about 10 minutes.</AppText>
          <View style={styles.pills}>
            {['About 10 minutes', 'Saves as you go'].map((label) => (
              <View key={label} style={styles.pill}><AppText variant="micro" color={colors.purple}>{label}</AppText></View>
            ))}
          </View>
        </View>

        <View style={styles.formCard}>
          <AppText variant="sectionTitle">{sentTo ? 'Enter your code' : 'Start with your email'}</AppText>
          <AppText variant="body" color={colors.muted}>
            {sentTo ? 'We emailed you a 6-digit code.' : 'Already applied? Use the same email to see where your application stands.'}
          </AppText>
          {notice ? <Banner tone="info">{notice}</Banner> : null}
          {!sentTo ? (
            <>
              <TextField label="Your email" hint="We will email you a 6-digit code. No password needed." value={email} onChangeText={(v) => { setEmail(v); setError(null); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} textContentType="emailAddress" placeholder="you@example.com" error={error ?? undefined} />
              <Button label="Send me a code" loading={busy} onPress={() => void send()} />
            </>
          ) : (
            <>
              <Banner tone="info">{`Sent to ${sentTo}. It is valid for 5 minutes. Check your spam folder if you do not see it.`}</Banner>
              <TextField label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null); }} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} placeholder="••••••" error={error ?? undefined} />
              <Button label="Continue" loading={busy} disabled={code.length !== 6} onPress={() => void verify()} />
              <Button label={wait > 0 ? `Send again in ${wait}s` : 'Send a new code'} variant="soft" disabled={busy || wait > 0} onPress={() => void send()} />
              <Button label="Change email" variant="ghost" onPress={() => { setSentTo(null); setError(null); }} />
            </>
          )}
        </View>

        {!sentTo ? (
          <View style={styles.section}>
            <AppText variant="sectionTitle">How it works</AppText>
            {STEPS.map(([title, note], index) => (
              <View key={title} style={styles.stepRow}>
                <View style={styles.stepNumber}><AppText variant="bodyStrong" color={colors.white}>{index + 1}</AppText></View>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">{title}</AppText>
                  <AppText variant="body" color={colors.muted}>{note}</AppText>
                </View>
              </View>
            ))}

            <AppText variant="sectionTitle" style={{ marginTop: 12 }}>Keep these ready</AppText>
            <View style={styles.readyCard}>
              {NEEDS.map((item) => (
                <View key={item.title} style={styles.readyRow}>
                  <View style={styles.readyIcon}><Icon name={item.icon} color={colors.purple} size={20} /></View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{item.title}</AppText>
                    <AppText variant="caption" color={colors.muted}>{item.note}</AppText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.lavender, paddingHorizontal: 22, paddingBottom: 56, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, gap: 12, overflow: 'hidden' },
  blobBig: { position: 'absolute', right: -70, top: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(75, 24, 248, 0.14)' },
  blobSmall: { position: 'absolute', right: 40, bottom: -40, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(201, 0, 216, 0.14)' },
  headline: { fontSize: 32, lineHeight: 38, marginTop: 14 },
  sub: { opacity: 0.75, lineHeight: 19 },
  pills: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pill: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  formCard: { marginHorizontal: 20, marginTop: -34, padding: 20, borderRadius: radius.xl, backgroundColor: colors.white, gap: 12, shadowColor: '#2A0C9E', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  section: { paddingHorizontal: 22, paddingTop: 28, gap: 14 },
  stepRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  readyCard: { borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 0.8, borderColor: colors.line, padding: 14, gap: 14 },
  readyRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  readyIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
});
