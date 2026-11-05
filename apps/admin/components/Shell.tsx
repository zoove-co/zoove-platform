'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { sessionSummary } from '@/lib/api';

import { can, useMe } from './me';
import { Icons, Wordmark, avatarTone, initials } from './ui';

const THEME_KEY = 'zoove.admin.theme';

// Planned sections. They are shown so the team can see where the panel is going; none of them open yet.
const SOON: [string, ReactNode][] = [
  ['Customers', Icons.customers],
  ['Complaints', Icons.complaints],
];

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const choose = (next: 'dark' | 'light') => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* the choice just will not be remembered */
    }
  };

  return (
    <div className="theme" role="group" aria-label="Theme">
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => choose('dark')}>
        {Icons.moon}
        <span>Dark</span>
      </button>
      <button type="button" aria-pressed={theme === 'light'} onClick={() => choose('light')}>
        {Icons.sun}
        <span>Light</span>
      </button>
    </div>
  );
}

function Profile() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const catalog = me.catalog.filter((item) => me.permissions.includes(item.key));
  return (
    <>
      <button className="me" type="button" onClick={() => setOpen(true)} aria-label="My profile">
        <span className={`avatar ${avatarTone(me.name)}`}>{initials(me.name)}</span>
        <span className="who"><b>{me.name}</b><span>{me.jobTitle}</span></span>
      </button>
      {open
        ? createPortal(
        <div className="modal" role="dialog" aria-modal="true" aria-label="My profile" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="who-head" style={{ marginBottom: 14 }}>
              <span className={`avatar lg ${avatarTone(me.name)}`}>{initials(me.name)}</span>
              <div>
                <h2 style={{ marginBottom: 2 }}>{me.name}</h2>
                <div className="muted small">{me.email}</div>
              </div>
            </div>
            <dl className="kv">
              <dt>Role</dt><dd>{me.jobTitle}{me.isOwner && me.jobTitle.trim().toLowerCase() !== 'owner' ? ' · Owner' : ''}</dd>
              <dt>Reports to</dt><dd>{me.reportsTo?.name ?? '—'}</dd>
              <dt>Access</dt>
              <dd>
                {me.isOwner ? 'Full access, including managing the team' : catalog.length === 0 ? 'Nothing is switched on yet' : (
                  <ul className="accesslist">{catalog.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
                )}
              </dd>
            </dl>
            <p className="muted small" style={{ margin: '14px 0 0' }}>Your role and access are set by an owner, and take effect straight away.</p>
            <div className="actions">
              {me.isOwner ? <Link className="btn ghost" href="/team" onClick={() => setOpen(false)}>Manage team</Link> : null}
              <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}

export function Shell({ signOut, pending, children }: { signOut: () => void; pending?: number; children: ReactNode }) {
  const me = useMe();
  const path = usePathname() ?? '/';
  const onTeam = path.startsWith('/team');
  const onCalc = path.startsWith('/economics');
  const onDiscounts = path.startsWith('/discounts');
  const onParties = path.startsWith('/parties');
  const onPackages = path.startsWith('/packages');
  const onSessions = path.startsWith('/sessions');
  const onOfferings = path.startsWith('/offerings');
  const onRewards = path.startsWith('/rewards');
  const other = onTeam || onCalc || onDiscounts || onParties || onPackages || onSessions || onOfferings || onRewards;
  // Sessions waiting for a trainer, so a cancellation is noticed without opening the page.
  const [waiting, setWaiting] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const canSessions = can(me, 'sessions.manage');
  useEffect(() => {
    if (!canSessions || me === null) return;
    let live = true;
    const tick = () => sessionSummary().then((s) => { if (live) { setWaiting(s.needsTrainer); setOverdue(s.overdue); } }).catch(() => undefined);
    void tick();
    const timer = setInterval(() => void tick(), 60_000);
    return () => { live = false; clearInterval(timer); };
  }, [canSessions, me]);
  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="side-brand" aria-label="Zoove admin home">
          <Wordmark />
          <span className="tag">admin</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {can(me, 'trainers.view') ? (
            <Link href="/" aria-current={other ? undefined : 'page'}>
              {Icons.users}
              Trainers
              {pending ? <span className="badge">{pending}</span> : null}
            </Link>
          ) : null}
          {SOON.map(([label, icon]) => (
            <span key={label} className="soonitem" aria-disabled="true" title="Coming soon">
              {icon}
              {label}
              <span className="soontag">Soon</span>
            </span>
          ))}
          {canSessions ? (
            <Link href="/sessions" aria-current={onSessions ? 'page' : undefined}>
              {Icons.sessions}
              Sessions
              {waiting ? <span className="badge" style={overdue ? { background: 'var(--red)', color: '#fff' } : undefined} title={overdue ? `${overdue} overdue` : undefined}>{waiting}</span> : null}
            </Link>
          ) : null}
          {can(me, 'catalog.manage') ? (
            <Link href="/offerings" aria-current={onOfferings ? 'page' : undefined}>
              {Icons.card}
              Offerings
            </Link>
          ) : null}
          {can(me, 'parties.manage') ? (
            <Link href="/parties" aria-current={onParties ? 'page' : undefined}>
              {Icons.sessions}
              Party requests
            </Link>
          ) : null}
          {can(me, 'packages.manage') ? (
            <Link href="/packages" aria-current={onPackages ? 'page' : undefined}>
              {Icons.card}
              Packages
            </Link>
          ) : null}
          {can(me, 'rewards.manage') ? (
            <Link href="/rewards" aria-current={onRewards ? 'page' : undefined}>
              {Icons.gift}
              Rewards
            </Link>
          ) : null}
          {can(me, 'discounts.manage') ? (
            <Link href="/discounts" aria-current={onDiscounts ? 'page' : undefined}>
              {Icons.tag}
              Discount codes
            </Link>
          ) : null}
          {me?.isOwner ? (
            <Link href="/team" aria-current={onTeam ? 'page' : undefined}>
              {Icons.team}
              Team
            </Link>
          ) : null}
          {can(me, 'tools.economics') ? (
            <Link href="/economics" aria-current={onCalc ? 'page' : undefined}>
              {Icons.calc}
              Calculator
            </Link>
          ) : null}
        </nav>
        <div className="side-foot">
          <Profile />
          <ThemeToggle />
          <button className="signout" type="button" onClick={signOut}>
            {Icons.out}
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
