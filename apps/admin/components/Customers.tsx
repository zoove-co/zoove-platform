'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, getCustomer, listCustomers, type CustomerDetail, type CustomerRow } from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Spinner } from './ui';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const STATUS_LABEL: Record<string, string> = { matching: 'Finding a trainer', rematching: 'Finding a new trainer', confirmed: 'Confirmed', completed: 'Done', cancelled: 'Cancelled' };
const STATUS_PILL: Record<string, string> = { matching: 'changes_requested', rematching: 'submitted', confirmed: 'approved', completed: 'approved', cancelled: 'rejected' };
const PACKAGE_LABEL: Record<string, string> = { awaiting_payment: 'Awaiting payment', paid: 'Paid', cancelled: 'Cancelled' };

export function Customers({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const allowed = can(me, 'customers.view');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<CustomerDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const handle = useCallback((err: unknown): string | null => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return null; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  // Search as the team types, but wait a moment so each letter is not a request.
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const timer = setTimeout(() => {
      listCustomers(query)
        .then((r) => { if (live) { setRows(r.customers); setTotal(r.total); setError(null); } })
        .catch((err) => { if (live) setError(handle(err)); });
    }, query ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [allowed, query, handle]);

  async function show(id: string) {
    setOpening(id);
    try { setOpen(await getCustomer(id)); setError(null); } catch (err) { setError(handle(err)); } finally { setOpening(null); }
  }

  if (!allowed) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Customers</h1></div></div>
        <Banner tone="info">You do not have access to customers. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Customers</h1>
          <p className="muted">Everyone who has signed in to the customer app. Opening a customer is recorded with your name.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search customers" style={{ flex: '1 1 260px', maxWidth: 420 }} />
        {rows ? <span className="muted small">{total > rows.length ? `Showing the newest ${rows.length} of ${total}` : `${total} customer${total === 1 ? '' : 's'}`}</span> : null}
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!rows && !error ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : null}
      {rows && rows.length === 0 ? <Banner tone="info">{query ? 'No customer matches that search.' : 'No customers yet. They appear here after they sign in to the app.'}</Banner> : null}
      {rows && rows.length > 0 ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead><tr><th>Customer</th><th>Contact</th><th>Sessions</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name ?? 'No name yet'}</b>{c.status !== 'active' ? <div className="sub small" style={{ color: 'var(--red)', fontWeight: 600 }}>{c.status}</div> : null}</td>
                  <td>{c.phone ?? '—'}<div className="sub muted small">{c.email ?? 'No email'}</div></td>
                  <td>{c.sessionsDone} done{c.sessionsUpcoming ? ` · ${c.sessionsUpcoming} coming up` : ''}<div className="sub muted small">{rupees(c.spentPaise)} spent</div></td>
                  <td>{day(c.joinedAt)}<div className="sub muted small">{c.lastLoginAt ? `Last seen ${day(c.lastLoginAt)}` : 'Never signed in'}</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="btn ghost" href={`/sessions?customer=${c.id}&name=${encodeURIComponent(c.name ?? c.email ?? c.phone ?? 'this customer')}`}>Sessions</Link>{' '}
                    <button className="btn ghost" type="button" disabled={opening === c.id} onClick={() => void show(c.id)}>{opening === c.id ? <Spinner /> : null} Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={open.name ?? 'Customer'} onClick={() => setOpen(null)}>
          <div className="sheet wide" onClick={(event) => event.stopPropagation()}>
            <h2>{open.name ?? 'No name yet'}</h2>
            <dl className="kv">
              <dt>Phone</dt><dd>{open.phone ?? '—'}</dd>
              <dt>Email</dt><dd>{open.email ?? '—'}</dd>
              <dt>Joined</dt><dd>{day(open.joinedAt)}{open.lastLoginAt ? ` · last seen ${stamp(open.lastLoginAt)}` : ''}</dd>
              <dt>Sessions</dt><dd>{open.sessionsDone} done{open.sessionsUpcoming ? ` · ${open.sessionsUpcoming} coming up` : ''} · {rupees(open.spentPaise)} spent</dd>
              <dt>Referral code</dt><dd>{open.referralCode ?? '—'}{open.referredBy ? ` · joined through ${open.referredBy}` : ''}</dd>
              <dt>Ratings given</dt><dd>{open.ratingsGiven}</dd>
            </dl>

            <h3 style={{ marginBottom: 6 }}>Addresses</h3>
            {open.addresses.length === 0 ? <p className="muted small" style={{ marginTop: 0 }}>No saved address.</p> : (
              <ul className="accesslist" style={{ marginTop: 0 }}>
                {open.addresses.map((a) => <li key={a.id}><b>{a.label}</b>{a.isDefault ? ' (default)' : ''} · {[a.line1, a.line2, a.locality, a.city].filter(Boolean).join(', ')}{a.pincode ? ` ${a.pincode}` : ''}</li>)}
              </ul>
            )}

            <h3 style={{ marginBottom: 6 }}>Packages</h3>
            {open.packages.length === 0 ? <p className="muted small" style={{ marginTop: 0 }}>No packages bought.</p> : (
              <ul className="accesslist" style={{ marginTop: 0 }}>
                {open.packages.map((p) => <li key={p.id}><b>{p.name}</b> · {PACKAGE_LABEL[p.status] ?? p.status} · {p.creditsTotal - p.creditsUsed} of {p.creditsTotal} sessions left{p.expiresAt ? ` · valid till ${day(p.expiresAt)}` : ''} · {rupees(p.totalPaise)}</li>)}
              </ul>
            )}

            <h3 style={{ marginBottom: 6 }}>Sessions</h3>
            {open.bookings.length === 0 ? <p className="muted small" style={{ marginTop: 0 }}>No sessions yet.</p> : (
              <div className="tablewrap">
                <table className="list">
                  <thead><tr><th>Session</th><th>When</th><th>Trainer</th><th>Status</th><th>Paid</th></tr></thead>
                  <tbody>
                    {open.bookings.map((b) => (
                      <tr key={b.id}>
                        <td><b>{b.sessionCode}</b><div className="sub muted small">{b.serviceName} · {b.formatName}</div></td>
                        <td>{b.startsAt ? stamp(b.startsAt) : b.mode === 'instant' ? 'As soon as possible' : 'To be scheduled'}</td>
                        <td>{b.trainerName ?? '—'}</td>
                        <td><span className={`pill ${STATUS_PILL[b.status] ?? 'submitted'}`}>{STATUS_LABEL[b.status] ?? b.status}</span>{b.rating !== null ? <span className="sub muted small">{` ${'★'.repeat(b.rating)}`}</span> : null}</td>
                        <td>{rupees(b.totalPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {open.bookings.length === 50 ? <p className="muted small">Showing the latest 50 sessions.</p> : null}

            <div className="actions"><button className="btn ghost" type="button" onClick={() => setOpen(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
