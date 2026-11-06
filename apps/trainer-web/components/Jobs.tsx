'use client';

import { useCallback, useEffect, useState } from 'react';

import { acceptJob, ApiError, cancelJob, checkInJob, checkOutJob, getJobs, type JobBoard, type MyJob, type OpenJob } from '@/lib/api';
import { Spinner } from './ui';

const PEOPLE: Record<string, string> = { personal: 'Personal', duo: 'Duo', loved_one: 'Loved one', group: 'Group' };
const who = (j: OpenJob) => `${PEOPLE[j.participant] ?? j.participant}${j.groupSize ? ` (${j.groupSize})` : ''}`;

// The trainer's jobs: open sessions to pick up (first to accept gets it) and the sessions they already hold. Refreshes by itself.
export function Jobs({ onExpired }: { onExpired: () => void }) {
  const [board, setBoard] = useState<JobBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);

  const fail = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return onExpired();
    setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
  }, [onExpired]);
  const load = useCallback(async () => {
    try { setBoard(await getJobs()); setError(null); } catch (err) { fail(err); }
  }, [fail]);

  useEffect(() => { void load(); }, [load]);
  // New jobs show up by themselves.
  useEffect(() => {
    if (cancelling || busy) return;
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load, cancelling, busy]);

  async function run(id: string, action: () => Promise<JobBoard>, done: string) {
    setBusy(id); setError(null); setNote(null);
    try { setBoard(await action()); setNote(done); setCancelling(null); setReason(''); }
    catch (err) { fail(err); await load(); }
    finally { setBusy(null); }
  }

  if (!board) return error ? <div className="banner bad">{error}</div> : <div className="center" style={{ padding: 30 }} aria-busy><Spinner /></div>;

  return (
    <>
      {error ? <div className="banner bad" role="alert">{error}</div> : null}
      {note && !error ? <div className="banner good">{note}</div> : null}

      <h2 style={{ margin: '18px 0 8px' }}>Your sessions</h2>
      {board.mine.length === 0 ? <div className="card soft"><span className="muted small">No sessions yet. Pick one from the open jobs below, or our team may assign you one and email you.</span></div> : null}
      {board.mine.map((j: MyJob) => (
        <div className="card" key={j.id} style={{ marginBottom: 10 }}>
          <b>{j.whenLabel}</b>
          <div>{j.serviceName} · {j.formatName} · {who(j)}</div>
          <div className="muted small" style={{ marginTop: 6 }}>{j.customerFirstName} · {j.addressLabel}: {j.addressLine}{j.pincode ? `, ${j.pincode}` : ''}</div>
          <div className="muted small">Session {j.sessionCode}</div>
          {j.started && !j.timeUp ? <div className="muted small" style={{ marginTop: 10 }}>This session is live. The finish code opens when the timer ends{j.endsAt ? ` (${new Date(j.endsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })})` : ''}.</div> : null}
          {(j.started && j.timeUp) || j.canCheckIn ? (
            <div style={{ marginTop: 10 }}>
              <label className="field"><span>{j.started ? 'Finish code (ask the customer after the training)' : 'Start code (ask the customer when you arrive)'}</span><input inputMode="numeric" maxLength={4} value={codes[j.id] ?? ''} onChange={(e) => setCodes((all) => ({ ...all, [j.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="4 digits" /></label>
              <button className="btn small" type="button" style={{ marginTop: 8, marginRight: 8 }} disabled={busy === j.id || (codes[j.id] ?? '').length !== 4} onClick={() => void run(j.id, () => (j.started ? checkOutJob : checkInJob)(j.id, codes[j.id] ?? ''), j.started ? 'Thank you. The session is done.' : 'The session is live.')}>{busy === j.id ? <Spinner /> : null} {j.started ? 'Finish session' : 'Start session'}</button>
            </div>
          ) : null}
          {j.canCancel ? (
            cancelling === j.id ? (
              <div style={{ marginTop: 10 }}>
                <label className="field"><span>Why can you not make it?</span><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: unwell, family emergency" /></label>
                <div className="muted small" style={{ margin: '6px 0' }}>The customer and our team are told, and the session goes back to open for other trainers. You cannot pick this session up again.</div>
                <div className="actions">
                  <button className="btn ghost small" type="button" disabled={busy === j.id} onClick={() => { setCancelling(null); setReason(''); }}>Keep it</button>
                  <button className="btn danger small" type="button" disabled={busy === j.id || reason.trim().length < 3} onClick={() => void run(j.id, () => cancelJob(j.id, reason.trim()), 'Cancelled. The session is open again for other trainers.')}>{busy === j.id ? <Spinner /> : null} Cancel this session</button>
                </div>
              </div>
            ) : (
              <button className="btn ghost small" type="button" style={{ marginTop: 10 }} onClick={() => { setCancelling(j.id); setReason(''); }}>I cannot make it</button>
            )
          ) : null}
        </div>
      ))}

      <h2 style={{ margin: '22px 0 8px' }}>Open jobs</h2>
      <p className="muted small" style={{ margin: '0 0 10px' }}>Sessions near you that nobody has taken yet. Jobs closest to you appear first, and more appear as we widen the search. The first trainer to accept gets it. You only see jobs at times you are free. The full address shows after you accept.</p>
      {board.open.length === 0 ? <div className="card soft"><span className="muted small">No open jobs right now. This page checks again every few seconds.</span></div> : null}
      {board.open.map((j) => (
        <div className="card" key={j.id} style={{ marginBottom: 10 }}>
          <b>{j.whenLabel}</b>
          <div>{j.serviceName} · {j.formatName} · {who(j)}</div>
          <div className="muted small">{j.area ?? 'Mumbai'} · Session {j.sessionCode}</div>
          <button className="btn small" type="button" style={{ marginTop: 10 }} disabled={busy === j.id} onClick={() => void run(j.id, () => acceptJob(j.id), 'It is yours. Details are under Your sessions.')}>{busy === j.id ? <Spinner /> : null} Accept this job</button>
        </div>
      ))}
    </>
  );
}
