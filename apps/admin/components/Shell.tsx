'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { Icons, Wordmark } from './ui';

const THEME_KEY = 'zoove.admin.theme';

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

export function Shell({ signOut, pending, children }: { signOut: () => void; pending?: number; children: ReactNode }) {
  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="side-brand" aria-label="Zoove admin home">
          <Wordmark />
          <span className="tag">admin</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/" aria-current="page">
            {Icons.users}
            Trainers
            {pending ? <span className="badge">{pending}</span> : null}
          </Link>
        </nav>
        <div className="side-foot">
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
