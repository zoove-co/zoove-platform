'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, listPartyRequests, setPartyStatus, type PartyRequest, type PartyStatus } from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Spinner } from './ui';

const STATUS_LABEL: Record<PartyStatus, string> = { new: 'New', contacted: 'Called', confirmed: 'Confirmed', cancelled: 'Cancelled' };
const STATUS_PILL: Record<PartyStatus, string> = { new: 'changes_requested', contacted: 'in_review', confirmed: 'approved', cancelled: 'rejected' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function Parties({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [rows, setRows] = useState<PartyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PartyRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const load = useCallback(async () => {
    try { setRows(await listPartyRequests()); setError(null); } catch (err) { setError(handle(err) || null); }
  }, [handle]);

  useEffect(() => { if (can(me, 'parties.manage')) void load(); }, [load, me]);

  if (!can(me, 'parties.manage')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Party requests</h1></div></div>
        <Banner tone="info">You do not have access to party requests. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function change(status: PartyStatus) {
    if (!open) return;
    setBusy(true);
    try {
      await setPartyStatus(open.id, status, note.trim() || undefined);
      setOpen(null);
      await load();
    } catch (err) {
      setError(handle(err) || null);
    } finally {
      setBusy(false);
    }
  }

  const fresh = rows?.filter((row) => row.status === 'new').length ?? 0;
  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Party requests</h1>
          <p>Customers ask for a party in the app. Call them on the number shown, agree the details and price, then mark it confirmed.</p>
        </div>
      </div>
      {fresh > 0 ? <Banner tone="warn">{fresh} new {fresh === 1 ? 'request is' : 'requests are'} waiting for a call.</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!rows && !error ? (
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      ) : rows && rows.length === 0 ? (
        <Banner tone="info">No party requests yet.</Banner>
      ) : rows ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead><tr><th>Party</th><th>When</th><th className="hide-sm">Where</th><th>Call</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><b>{cap(row.occasion)}</b> · {row.guests} guests<div className="sub muted small">{cap(row.serviceSlug)} · {row.customer}</div></td>
                  <td>{when(row.startsAt)}</td>
                  <td className="hide-sm muted">{row.address}</td>
                  <td>{row.contactPhone ? <a href={`tel:${row.contactPhone}`}>{row.contactPhone}</a> : '—'}</td>
                  <td><span className={`pill ${STATUS_PILL[row.status]}`}>{STATUS_LABEL[row.status]}</span>{row.handledBy ? <div className="sub muted small">{row.handledBy}</div> : null}</td>
                  <td><button className="btn ghost" type="button" onClick={() => { setOpen(row); setNote(row.adminNote ?? ''); }}>Update</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>{cap(open.occasion)} party · {open.guests} guests</h2>
            <p className="muted">{when(open.startsAt)} · {open.address}</p>
            <p>Call {open.contactPhone ?? 'the customer'}{open.customer ? ` (${open.customer})` : ''}.{open.note ? ` They wrote: “${open.note}”` : ''}</p>
            <div className="field full">
              <label>
                <span>Note for the team (not shown to the customer)</span>
                <input value={note} maxLength={1000} placeholder="Agreed price, who is coming, anything to remember" onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(null)}>Close</button>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void change('cancelled')}>Cancel request</button>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void change('contacted')}>Mark as called</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void change('confirmed')}>{busy ? <Spinner /> : null} Confirm party</button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
