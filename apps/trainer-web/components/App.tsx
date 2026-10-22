'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, getApplication, hasSession, signOut, type ApplicationView } from '@/lib/api';
import { SignIn } from './SignIn';
import { Status } from './Status';
import { Spinner } from './ui';
import { Wizard } from './Wizard';

type State = { kind: 'loading' } | { kind: 'signin'; notice?: string } | { kind: 'error'; message: string } | { kind: 'ready'; view: ApplicationView };

const SOURCE_KEY = 'zoove.trainer.source';

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [source, setSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasSession()) return setState({ kind: 'signin' });
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', view: await getApplication() });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'SESSION_EXPIRED' || err.status === 401)) return setState({ kind: 'signin', notice: 'Please sign in again. What you filled in is saved.' });
      if (err instanceof ApiError && err.status === 403) return setState({ kind: 'signin', notice: 'This account cannot apply as a trainer. Sign in with the email you applied with.' });
      setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' });
    }
  }, []);

  useEffect(() => {
    // ?ref=akash records where the trainer heard about Zoove.
    try {
      const ref = new URLSearchParams(window.location.search).get('ref')?.trim().slice(0, 60);
      if (ref) sessionStorage.setItem(SOURCE_KEY, ref);
      setSource(sessionStorage.getItem(SOURCE_KEY));
    } catch {
      /* storage unavailable: no source recorded */
    }
    void load();
  }, [load]);

  const expired = useCallback(() => {
    void signOut().then(() => setState({ kind: 'signin', notice: 'Your session ended. Please sign in again. What you filled in is saved.' }));
  }, []);

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">zoove</span>
        {state.kind === 'ready' ? (
          <button className="linkbtn" type="button" onClick={() => void signOut().then(() => setState({ kind: 'signin' }))}>
            Sign out
          </button>
        ) : null}
      </div>

      {state.kind === 'loading' ? (
        <div className="center" style={{ padding: 60 }} aria-busy>
          <Spinner />
        </div>
      ) : null}

      {state.kind === 'signin' ? <SignIn notice={state.notice} onDone={() => void load()} /> : null}

      {state.kind === 'error' ? (
        <>
          <div className="banner bad">{state.message}</div>
          <button className="btn" type="button" onClick={() => void load()}>
            Try again
          </button>
        </>
      ) : null}

      {state.kind === 'ready' ? (
        ['none', 'draft', 'changes_requested'].includes(state.view.status) ? (
          <Wizard key="wizard" initial={state.view} source={source} onChange={(view) => setState({ kind: 'ready', view })} onExpired={expired} />
        ) : (
          <Status view={state.view} />
        )
      ) : null}
    </div>
  );
}
