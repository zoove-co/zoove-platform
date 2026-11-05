'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  ApiError, assignTrainer, getSession, listAssignableTrainers, listSessions, recordTrainerCancel, recordTrainerNoShow,
  type AdminSession, type SessionDetail, type SessionFilter, type SessionStatus,
} from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Spinner } from './ui';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const STATUS_LABEL: Record<SessionStatus, string> = { matching: 'Finding a trainer', rematching: 'Finding a new trainer', confirmed: 'Confirmed', completed: 'Done', cancelled: 'Cancelled' };
const STATUS_PILL: Record<SessionStatus, string> = { matching: 'changes_requested', rematching: 'submitted', confirmed: 'approved', completed: 'approved', cancelled: 'rejected' };
const EVENT_LABEL: Record<string, string> = {
  created: 'Booked by the customer', rescheduled: 'Moved to another time', cancelled: 'Cancelled', trainer_assigned: 'Trainer assigned', trainer_cancelled: 'Trainer cancelled', trainer_no_show: 'Trainer did not arrive', overdue: 'Start time passed with no trainer, customer told',
};
const FILTERS: [SessionFilter, string][] = [['needs_trainer', 'Needs a trainer'], ['upcoming', 'Confirmed'], ['all', 'All sessions']];
const PEOPLE: Record<string, string> = { personal: 'Personal', duo: 'Duo', loved_one: 'Loved one', group: 'Group' };

export function Sessions({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [filter, setFilter] = useState<SessionFilter>('needs_trainer');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SessionDetail | null>(null);
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([]);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const load = useCallback(async () => {
    try { setRows(await listSessions(filter, query)); setError(null); } catch (err) { setError(handle(err) || null); }
  }, [filter, query, handle]);

  // The email link opens this page with ?code=ZV-XXXXXXXX: search for that session across all sessions.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) { setQuery(code); setFilter('all'); }
  }, []);
  useEffect(() => {
    if (!can(me, 'sessions.manage')) return;
    const t = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, me, query]);

  if (!can(me, 'sessions.manage')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Sessions</h1></div></div>
        <Banner tone="info">You do not have access to sessions. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function show(id: string) {
    setFormError(null); setPick(''); setReason('');
    try {
      const [detail, list] = await Promise.all([getSession(id), listAssignableTrainers()]);
      setOpen(detail); setTrainers(list);
    } catch (err) { setError(handle(err) || null); }
  }
  async function act(action: () => Promise<SessionDetail>) {
    setBusy(true); setFormError(null);
    try { const d = await action(); setOpen(d); setPick(''); setReason(''); await load(); }
    catch (err) { const m = handle(err); if (m) setFormError(m); } finally { setBusy(false); }
  }
  const cancelledTrainerIds = new Set(open?.events.filter((e) => e.type === 'trainer_cancelled' || e.type === 'trainer_no_show').map((e) => String(e.payload.trainerId)) ?? []);

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Sessions</h1>
          <p>Every session has a code the customer also sees. A session goes under Needs a trainer when a trainer cancels or does not arrive. Overdue ones are in red at the top.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(([key, label]) => <button key={key} type="button" className="chipbtn" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by session code, name or email" aria-label="Search sessions" style={{ flex: '1 1 220px', maxWidth: 360 }} />
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!rows && !error ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : null}
      {rows && rows.length === 0 ? <Banner tone="info">{filter === 'needs_trainer' ? 'Every session has a trainer.' : 'No sessions found.'}</Banner> : null}
      {rows && rows.length > 0 ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead><tr><th>Session</th><th>Customer</th><th>When</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} style={s.startPassed ? { background: 'rgba(220, 38, 38, 0.07)' } : undefined}>
                  <td><b>{s.sessionCode}</b><div className="sub muted small">{s.serviceName} · {s.formatName} · {PEOPLE[s.participant] ?? s.participant}{s.groupSize ? ` of ${s.groupSize}` : ''}</div></td>
                  <td>{s.customerName}<div className="sub muted small">{s.area ?? ''}</div></td>
                  <td>{s.whenLabel}{s.startPassed ? <div className="sub small" style={{ color: 'var(--red)', fontWeight: 600 }}>Overdue: start time has passed</div> : null}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                    {s.trainerCancelledAt && s.status === 'rematching' ? <div className="sub muted small">Trainer cancelled {stamp(s.trainerCancelledAt)}</div> : null}
                    {s.trainerName && s.status === 'confirmed' ? <div className="sub muted small">{s.trainerName}</div> : null}
                  </td>
                  <td><button className="btn ghost" type="button" onClick={() => void show(s.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={`Session ${open.sessionCode}`}>
          <div className="sheet wide">
            <h2>Session {open.sessionCode} <span className={`pill ${STATUS_PILL[open.status]}`}>{STATUS_LABEL[open.status]}</span></h2>
            <dl className="kv">
              <dt>Service</dt><dd>{open.serviceName} · {open.formatName} · {PEOPLE[open.participant] ?? open.participant}{open.groupSize ? ` of ${open.groupSize}` : ''}</dd>
              <dt>When</dt><dd>{open.whenLabel}{open.mode === 'instant' ? ' (instant)' : ''}</dd>
              <dt>Customer</dt><dd>{open.customerName} · {open.customerContact}</dd>
              {open.recipient ? <><dt>For</dt><dd>{open.recipient.name} · {open.recipient.phone}</dd></> : null}
              <dt>Where</dt><dd>{open.addressLabel} · {open.addressLine}{open.pincode ? `, ${open.pincode}` : ''}</dd>
              <dt>Paid</dt><dd>{open.paidWithCredit ? 'With a package credit' : rupees(open.totalPaise)}{open.discountCode ? ` (code ${open.discountCode})` : ''}</dd>
              <dt>Trainer</dt><dd>{open.trainerName ?? 'Not assigned'}{open.trainerCancelCount ? ` · cancelled ${open.trainerCancelCount} time${open.trainerCancelCount > 1 ? 's' : ''}` : ''}</dd>
            </dl>
            {open.startPassed ? <Banner tone="warn">Overdue: the start time has passed and no trainer is on this session. The customer has been told and can move it or cancel it. Call them to apologise and help them rebook. A trainer cannot be assigned to a time that has passed.</Banner> : null}

            <h3 style={{ marginBottom: 6 }}>History</h3>
            <ul className="accesslist" style={{ marginTop: 0 }}>
              {open.events.map((e, i) => (
                <li key={i}>
                  {stamp(e.createdAt)} · {EVENT_LABEL[e.type] ?? e.type}
                  {e.type === 'trainer_cancelled' && e.payload.reason ? ` — “${String(e.payload.reason)}”` : ''}
                  {e.type === 'trainer_no_show' && e.payload.note ? ` — “${String(e.payload.note)}”` : ''}
                </li>
              ))}
            </ul>

            {open.status === 'matching' || open.status === 'rematching' ? (
              <div className="fields" style={{ marginTop: 10 }}>
                <label className="field full">
                  <span>Assign a trainer</span>
                  <select value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Choose a trainer</option>
                    {trainers.map((t) => <option key={t.id} value={t.id} disabled={cancelledTrainerIds.has(t.id)}>{t.name}{cancelledTrainerIds.has(t.id) ? ' (dropped this session)' : ''}</option>)}
                  </select>
                  {trainers.length === 0 ? <div className="hint">No active trainers yet. Approve a trainer application first.</div> : null}
                </label>
              </div>
            ) : null}
            {open.status === 'confirmed' ? (
              <div className="fields" style={{ marginTop: 10 }}>
                <label className="field full">
                  <span>{open.canMarkNoShow && open.startsAt ? 'What happened (note)' : 'The trainer cannot make it (reason)'}</span>
                  <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={open.canMarkNoShow && open.startsAt ? 'For example: trainer not reachable, did not reach the address' : 'For example: unwell, family emergency'} />
                  <div className="hint">
                    {open.canMarkNoShow && open.startsAt
                      ? 'If the trainer did not arrive, the customer is told, the session goes back to Needs a trainer, and this trainer cannot be put back on it.'
                      : 'The customer is told and can wait, move the session or cancel. It goes back to Needs a trainer.'}
                  </div>
                </label>
              </div>
            ) : null}
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(null)}>Close</button>
              {open.status === 'matching' || open.status === 'rematching' ? (
                <button className="btn" type="button" disabled={busy || !pick} onClick={() => void act(() => assignTrainer(open.id, pick))}>{busy ? <Spinner /> : null} Assign trainer</button>
              ) : null}
              {open.status === 'confirmed' && (!open.startsAt || !open.canMarkNoShow) ? (
                <button className="btn" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void act(() => recordTrainerCancel(open.id, reason.trim()))}>{busy ? <Spinner /> : null} Record trainer cancelled</button>
              ) : null}
              {open.status === 'confirmed' && open.canMarkNoShow ? (
                <button className="btn" type="button" style={{ background: 'var(--red)' }} disabled={busy || reason.trim().length < 3} onClick={() => void act(() => recordTrainerNoShow(open.id, reason.trim()))}>{busy ? <Spinner /> : null} Trainer did not arrive</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
