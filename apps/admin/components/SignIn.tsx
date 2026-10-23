'use client';

import { useEffect, useRef, useState } from 'react';

import { ApiError, requestCode, verifyCode } from '@/lib/api';
import { Banner, Field, Spinner } from './ui';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CODE_ERRORS: Record<string, string> = {
  OTP_INVALID: 'That code is not right. Check the email and try again.',
  OTP_LOCKED: 'Too many wrong tries. Ask for a new code in a few minutes.',
  OTP_RATE_LIMITED: 'You asked for too many codes. Please wait a bit and try again.',
  EMAIL_FAILED: 'We could not send the email just now. Please try again in a minute.',
  ACCOUNT_BLOCKED: 'This account cannot be used here.',
};

export function SignIn({ onDone, notice }: { onDone: () => void; notice?: string | undefined }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  const message = (err: unknown): string => {
    if (err instanceof ApiError) return CODE_ERRORS[err.code] ?? err.message;
    return 'Something went wrong. Please try again.';
  };

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
      // The API says how long to wait when we ask too soon.
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
      await verifyCode(sentTo, code);
      onDone();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <p className="muted">Use your Zoove admin email. We will send you a 6-digit code.</p>
      <div className="box">
      {notice ? <Banner tone="info">{notice}</Banner> : null}
      {!sentTo ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Field label="Your email" hint="Only Zoove admins receive a code." error={error ?? undefined}>
            <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="you@zoove.co" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} />
          </Field>
          <button className="btn block" type="submit" disabled={busy}>
            {busy ? <Spinner /> : null} Send me a code
          </button>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          <Banner tone="info">
            If <b>{sentTo}</b> is an admin account, a code is on its way. It is valid for 5 minutes. Check spam if you do not see it.
          </Banner>
          <Field label="6-digit code" error={error ?? undefined}>
            <input ref={codeRef} className="codebox" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={Boolean(error)} />
          </Field>
          <button className="btn block" type="submit" disabled={busy || code.length !== 6}>
            {busy ? <Spinner /> : null} Continue
          </button>
          <div className="actions">
            <button className="btn ghost" type="button" disabled={busy || wait > 0} onClick={() => void send()}>
              {wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              Change email
            </button>
          </div>
        </form>
      )}
      </div>
    </>
  );
}
