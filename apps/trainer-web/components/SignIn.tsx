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
  ACCOUNT_BLOCKED: 'This account cannot be used here. Please contact Zoove.',
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

  const needs = [
    { title: 'Aadhaar card', note: 'Front and back' },
    { title: 'PAN card', note: 'Photo or PDF' },
    { title: 'A selfie', note: 'Taken with your camera' },
    { title: 'A certificate', note: 'Yoga, fitness or training. At least one' },
  ];

  return (
    <main className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <span className="brand">zoove</span>
        <div className="hero-body">
          <h1 id="hero-title">Train clients at home, across Mumbai.</h1>
          <p className="lede">Apply in about 10 minutes. Your answers save as you go, so you can stop and finish later.</p>
          <div className="needs-wrap">
            <p className="needs-title">Keep these ready</p>
            <ul className="needs">
              {needs.map((item) => (
                <li key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="gate" aria-label="Sign in">
        <div className="gate-inner">
          <h2>{sentTo ? 'Enter your code' : 'Start with your email'}</h2>
          <p className="muted gate-sub">
            {sentTo ? 'We emailed you a 6-digit code.' : 'Already applied? Use the same email to see where your application stands.'}
          </p>
          {notice ? <Banner tone="info">{notice}</Banner> : null}
          {!sentTo ? (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <Field label="Your email" hint="We will email you a 6-digit code. No password needed." error={error ?? undefined}>
                <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} />
              </Field>
              <button className="btn" type="submit" disabled={busy}>
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
                Sent to <b>{sentTo}</b>. It is valid for 5 minutes. Check your spam folder if you do not see it.
              </Banner>
              <Field label="6-digit code" error={error ?? undefined}>
                <input ref={codeRef} className="codebox" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={Boolean(error)} />
              </Field>
              <button className="btn" type="submit" disabled={busy || code.length !== 6}>
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
      </section>
    </main>
  );
}
