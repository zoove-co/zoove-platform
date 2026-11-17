'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, getAttention, type Attention as AttentionData } from '@/lib/api';
import { Shell } from './Shell';
import { Banner, Spinner } from './ui';

// "12 min ago", "3 h ago", "2 d ago".
function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

// One place that gathers what needs a person: bookings nobody accepted, trainers who cancelled, late starts, low ratings and
// waiting requests. It only lists; each row opens the page where the work is done. Refreshes by itself every 30 seconds.
export function Attention({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const [data, setData] = useState<AttentionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getAttention());
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return expired();
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }, [expired]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Needs attention</h1>
          <p>Everything that needs someone at Zoove right now. Rows in red are urgent. You only see what you are allowed to handle.</p>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!data && !error ? (
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      ) : data && data.total === 0 ? (
        <Banner tone="good">All clear. Nothing needs attention right now.</Banner>
      ) : data ? (
        <>
          {data.urgent > 0 ? <Banner tone="bad">{data.urgent} urgent {data.urgent === 1 ? 'item needs' : 'items need'} you now.</Banner> : null}
          {data.groups.map((group) => (
            <section key={group.key} className="panel" style={{ marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{group.title} <span className="muted">· {group.items.length}</span></h2>
                <div className="muted small">{group.hint}</div>
              </div>
              <table className="list">
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td style={item.urgent ? { borderLeft: '3px solid var(--red)' } : undefined}>
                        <b>{item.title}</b>
                        <div className="sub muted small">{item.detail}</div>
                      </td>
                      <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{ago(item.since)}</td>
                      <td style={{ textAlign: 'right' }}><Link className="btn ghost" href={item.href}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      ) : null}
    </Shell>
  );
}
