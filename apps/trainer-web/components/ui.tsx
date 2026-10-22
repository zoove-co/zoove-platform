'use client';

import type { ReactNode } from 'react';

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Field({ label, hint, error, group, children }: { label: string; hint?: string; error?: string | undefined; group?: boolean; children: ReactNode }) {
  const body = (
    <>
      {children}
      {hint && !error ? <div className="hint">{hint}</div> : null}
      {error ? <div className="err" role="alert">{error}</div> : null}
    </>
  );
  // A group of buttons (chips) must not sit inside a <label>: tapping the label text would press the first button.
  if (group) {
    return (
      <div className="field" role="group" aria-label={label}>
        <span>{label}</span>
        {body}
      </div>
    );
  }
  return (
    <label className="field">
      <span>{label}</span>
      {body}
    </label>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'bad' | 'good' | 'info'; children: ReactNode }) {
  return <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress" aria-label={`Step ${step + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <i key={index} className={index <= step ? 'done' : ''} />
      ))}
    </div>
  );
}
