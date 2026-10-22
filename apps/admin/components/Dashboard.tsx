'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, STATUS_LABEL, listApplications, nice, type Filter, type ListResult } from '@/lib/api';
import { Banner, Spinner } from './ui';

const TABS: [Filter, string][] = [
  ['pending', 'Needs review'],
  ['changes_requested', 'Changes requested'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];
const REFRESH_MS = 15_000;

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';

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

  // Reload when the tab or search changes (search waits a moment for typing to stop).
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

  return (
    <div className="wide">
      <div className="topbar">
        <span className="brand">zoove admin</span>
        <button className="linkbtn" type="button" onClick={signOut}>Sign out</button>
      </div>
      <h1>Trainers {pending > 0 ? <span className="count hot" style={{ fontSize: 15, verticalAlign: 'middle' }}>{pending} waiting</span> : null}</h1>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" className="tab" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
            {countOf(key) !== undefined ? <span className={`count ${key === 'pending' && pending > 0 ? 'hot' : ''}`}>{countOf(key)}</span> : null}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search name, phone or email" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search applications" />
        <span className="grow" />
        <span className="muted small">{updated ? `Updated ${updated.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}</span>
        <button className="btn ghost small" type="button" onClick={() => void load()}>Refresh</button>
      </div>

      {error ? <Banner tone="bad">{error} We will keep trying.</Banner> : null}

      {loading && !data ? (
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      ) : data && data.items.length === 0 ? (
        <div className="emptyrow">{search ? 'No applications match your search.' : filter === 'pending' ? 'Nothing waiting for review. 🎉' : 'No applications here yet.'}</div>
      ) : (
        <table className="list">
          <thead>
            <tr><th>Applicant</th><th>Contact</th><th>Trains</th><th>Source</th><th>Submitted</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="row-link" onClick={() => router.push(`/applications/${item.id}`)}>
                <td><Link href={`/applications/${item.id}`} onClick={(event) => event.stopPropagation()}><b>{item.name || '—'}</b></Link></td>
                <td>{item.phone ?? '—'}<br /><span className="muted small">{item.email ?? ''}</span></td>
                <td>{item.specialties.map(nice).join(', ') || '—'}<br /><span className="muted small">{item.experienceYears === null ? '' : `${item.experienceYears} yrs`}</span></td>
                <td>{item.source ?? '—'}</td>
                <td>{fmt(item.submittedAt)}</td>
                <td><span className={`pill ${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
