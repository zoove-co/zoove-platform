'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, STATUS_LABEL, listApplications, nice, type Filter, type ListResult } from '@/lib/api';
import { Shell } from './Shell';
import { Banner, Icons, Spinner } from './ui';

type Card = { key: Filter; label: string; tone: 't-orange' | 't-amber' | 't-green' | 't-red' };
const CARDS: Card[] = [
  { key: 'pending', label: 'Needs review', tone: 't-orange' },
  { key: 'changes_requested', label: 'Changes requested', tone: 't-amber' },
  { key: 'approved', label: 'Approved', tone: 't-green' },
  { key: 'rejected', label: 'Rejected', tone: 't-red' },
];
const REFRESH_MS = 15_000;

const absolute = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';

function ago(iso: string | null): string {
  if (!iso) return '—';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const avatarTone = (name: string) => `av${[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5}`;

export function Dashboard({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const result = await listApplications(filter, search);
      if (mine !== seq.current) return; // a newer request is already running
      setData(result);
      setUpdated(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return expired();
      if (mine === seq.current) setError(err instanceof ApiError ? err.message : 'Could not load the list.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [filter, search, expired]);

  // Reload when the filter or search changes (search waits a moment for typing to stop).
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // New submissions show up on their own: refresh every 15 seconds while this tab is open and visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const counts = data?.counts ?? {};
  const pending = (counts.submitted ?? 0) + (counts.in_review ?? 0);
  const countOf = (key: Filter): number | undefined => {
    if (!data) return undefined;
    if (key === 'pending') return pending;
    if (key === 'all') return Object.values(counts).reduce((sum, value) => sum + value, 0);
    return counts[key] ?? 0;
  };

  useEffect(() => {
    document.title = pending > 0 ? `(${pending}) Zoove admin` : 'Zoove admin';
  }, [pending]);

  const total = countOf('all');

  return (
    <Shell signOut={signOut} pending={pending}>
      <div className="pagehead">
        <div>
          <h1>Trainers</h1>
          <p>{pending > 0 ? `${pending} ${pending === 1 ? 'application is' : 'applications are'} waiting for your review.` : 'Review trainer applications and documents.'}</p>
        </div>
      </div>

      <div className="stats">
        {CARDS.map(({ key, label, tone }) => (
          <button key={key} type="button" className={`stat ${tone} ${key === 'pending' && pending > 0 ? 'hot' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            <span className="label"><i className="dot" />{label}</span>
            <div className="num">{countOf(key) ?? '–'}</div>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search">
          {Icons.search}
          <input type="search" placeholder="Search name, phone or email" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search applications" />
        </div>
        <button type="button" className="chipbtn" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All trainers{total !== undefined ? ` (${total})` : ''}
        </button>
        <span className="grow" />
        <span className="muted small">{updated ? `Updated ${updated.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
        <button className="iconbtn" type="button" onClick={() => void load()} aria-label="Refresh the list" title="Refresh">{Icons.refresh}</button>
      </div>

      {error ? <Banner tone="bad">{error} We will keep trying.</Banner> : null}

      {loading && !data ? (
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      ) : data && data.items.length === 0 ? (
        <div className="panel emptyrow">
          <b>{search ? 'No matches' : filter === 'pending' ? 'You are all caught up' : 'Nothing here yet'}</b>
          {search ? 'Try a different name, phone number or email.' : filter === 'pending' ? 'New applications appear here by themselves.' : 'Applications with this status will show up here.'}
        </div>
      ) : (
        <div className="panel tablewrap">
          <table className="list">
            <thead>
              <tr><th>Applicant</th><th>Mobile</th><th>Trains</th><th className="hide-sm">Source</th><th>Submitted</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data?.items.map((item) => {
                const name = item.name || 'Unnamed applicant';
                const shown = item.specialties.slice(0, 3);
                return (
                  <tr key={item.id} onClick={() => router.push(`/applications/${item.id}`)}>
                    <td>
                      <div className="person">
                        <span className={`avatar ${avatarTone(name)}`}>{initials(name)}</span>
                        <span className="who"><Link href={`/applications/${item.id}`} onClick={(event) => event.stopPropagation()}><b>{name}</b></Link><span className="sub">{item.email ?? ''}</span></span>
                      </div>
                    </td>
                    <td>{item.phone ?? '—'}</td>
                    <td>
                      <div className="tags">
                        {shown.map((slug) => <span className="tag-chip" key={slug}>{nice(slug)}</span>)}
                        {item.specialties.length > shown.length ? <span className="tag-chip">+{item.specialties.length - shown.length}</span> : null}
                        {item.experienceYears !== null ? <span className="muted small" style={{ alignSelf: 'center' }}>{item.experienceYears} yrs</span> : null}
                      </div>
                    </td>
                    <td className="hide-sm muted">{item.source ?? '—'}</td>
                    <td title={absolute(item.submittedAt)}>{ago(item.submittedAt)}</td>
                    <td><span className={`pill ${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
