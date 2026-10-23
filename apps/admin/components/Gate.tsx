'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ApiError, api, hasSession, signOut } from '@/lib/api';
import { SignIn } from './SignIn';
import { Spinner, Wordmark } from './ui';

type Ctx = { signOut: () => void; expired: () => void };

// Shows the sign-in screen until there is a working admin session, then the page.
export function Gate({ children }: { children: (ctx: Ctx) => ReactNode }) {
  const [state, setState] = useState<'loading' | 'signin' | 'ok' | 'forbidden'>('loading');
  const [notice, setNotice] = useState<string | undefined>();

  const check = useCallback(async () => {
    if (!hasSession()) return setState('signin');
    try {
      await api('/v1/admin/trainer-applications?limit=1');
      setState('ok');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) return setState('forbidden');
      if (err instanceof ApiError && err.status === 401) {
        setNotice('Please sign in again.');
        return setState('signin');
      }
      // Network or server trouble: show the page and let it retry on its own.
      setState('ok');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const out = useCallback(() => void signOut().then(() => { setNotice(undefined); setState('signin'); }), []);
  const expired = useCallback(() => void signOut().then(() => { setNotice('Your session ended. Please sign in again.'); setState('signin'); }), []);

  if (state === 'loading') return <div className="center" style={{ padding: 60 }}><Spinner /></div>;
  if (state === 'forbidden') {
    return (
      <div className="auth">
        <div className="auth-card">
          <Wordmark />
          <div className="box">
            <h1>No admin access</h1>
            <p className="muted" style={{ marginTop: 8 }}>This account is signed in but is not a Zoove admin.</p>
            <button className="btn block" type="button" onClick={out}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  if (state === 'signin') {
    return (
      <div className="auth">
        <div className="auth-card">
          <Wordmark />
          <SignIn notice={notice} onDone={() => void check()} />
        </div>
      </div>
    );
  }
  return <>{children({ signOut: out, expired })}</>;
}
