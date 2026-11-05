import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Wordmark } from '@/components/ui/Wordmark';
import { ApiError, requestCode, verifyCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CODE_ERRORS: Record<string, string> = {
  OTP_INVALID: 'That code is not right. Check the email and try again.',
  OTP_LOCKED: 'Too many wrong tries. Ask for a new code in a few minutes.',
  OTP_RATE_LIMITED: 'You asked for too many codes. Please wait a bit and try again.',
  EMAIL_FAILED: 'We could not send the email just now. Please try again in a minute.',
  ACCOUNT_BLOCKED: 'This account cannot be used here. Please contact Zoove.',
};
const message = (err: unknown): string => (err instanceof ApiError ? (CODE_ERRORS[err.code] ?? err.message) : 'Something went wrong. Please try again.');

const NEEDS: [string, string][] = [
  ['Aadhaar card', 'Front and back'],
  ['PAN card', 'Photo or PDF'],
  ['A selfie', 'Taken with your camera'],
  ['A certificate', 'Yoga, fitness or training. At least one'],
];

// Same email-code sign-in as the Join Zoove page. An account started on the web opens here with the same email.
export default function SignIn() {
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
    <Screen>
      <Wordmark width={150} />
      <View style={{ gap: 8 }}>
        <AppText variant="screenTitle">Train clients at home, across Mumbai.</AppText>
        <AppText variant="body" color={colors.muted}>
          Apply in about 10 minutes. Your answers save as you go, so you can stop and finish later, here or on the Join Zoove page.
        </AppText>
      </View>

      {!sentTo ? (
        <Card soft>
          <AppText variant="bodyStrong">Keep these ready</AppText>
          {NEEDS.map(([title, note]) => (
            <AppText key={title} variant="body">
              <AppText variant="bodyStrong">{title}</AppText>  {note}
            </AppText>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: 12 }}>
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
    </Screen>
  );
}
