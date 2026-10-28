'use client';

import type { ReactNode } from 'react';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const avatarTone = (name: string) => `av${[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5}`;

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`.trim()}>
      zoove<i>.</i>
    </span>
  );
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

// Small inline icons (stroke follows the text colour).
const icon = (paths: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths}
  </svg>
);
export const Icons = {
  users: icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.3 3 4.6" /></>),
  search: icon(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>, 16),
  refresh: icon(<><path d="M20 11a8 8 0 0 0-14.2-4.2L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.2 4.2L20 15" /><path d="M20 20v-5h-5" /></>, 16),
  sun: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>, 15),
  moon: icon(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />, 15),
  out: icon(<><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M16 8l4 4-4 4M20 12H9" /></>),
  customers: icon(<><circle cx="12" cy="8" r="3.4" /><path d="M5 20c.7-3.6 3.6-5.6 7-5.6s6.3 2 7 5.6" /></>),
  sessions: icon(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  complaints: icon(<><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>),
  team: icon(<><path d="M12 3 4.5 6v5.5c0 4.4 3.1 7.7 7.5 9.5 4.4-1.8 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>),
  calc: icon(<><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></>),
  back: icon(<path d="M15 5 8 12l7 7" />, 16),
  id: icon(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2" /><path d="M6.5 16c.4-1.4 1.4-2 2.5-2s2.1.6 2.5 2M14.5 10h4M14.5 13.5h3" /></>, 17),
  card: icon(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></>, 17),
  face: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.8 14.5c.8 1 1.9 1.5 3.2 1.5s2.4-.5 3.2-1.5" /></>, 17),
  file: icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></>, 17),
};
