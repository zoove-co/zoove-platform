'use client';

import { useEffect } from 'react';

import { RestDay } from '@/components/RestDay';

// A page that breaks shows this instead of a blank screen. "Try again" draws the page afresh.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <RestDay
      title="That one tripped us up"
      actions={
        <>
          <button className="btn" type="button" onClick={reset}>Try again</button>
          <a className="btn ghost" href="/">Back to the panel</a>
        </>
      }>
      This page hit an unexpected problem. Trying again usually fixes it. If it keeps happening, tell the tech team what you were doing.
    </RestDay>
  );
}
