'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, approveContactRequest, listTrainerContactRequests, rejectContactRequest, type ContactRequestStatus, type TrainerContactRequest } from '@/lib/api';
import { can, useMe } from './me';
import { Banner, PageLoader, Spinner } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const PILL: Record<ContactRequestStatus, string> = { pending: 'changes_requested', approved: 'approved', rejected: 'rejected', cancelled: 'rejected' };
const LABEL: Record<ContactRequestStatus, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', cancelled: 'Withdrawn' };

// A trainer's email is how they sign in, and both it and their mobile were checked when they were approved. So a trainer asks here, and
// someone at Zoove verifies it first (a call to the number on file is best) before approving. Nothing changes until then.
export function ContactRequestsPanel({ expired, onChanged }: { expired: () => void; onChanged?: () => void }) {
  const me = useMe();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [data, setData] = useState<{ pending: number; requests: TrainerContactRequest[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ row: TrainerContactRequest; decision: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const load = useCallback(async () => {
    try { setData(await listTrainerContactRequests(tab)); setError(null); } catch (err) { setError(handle(err) || null); }
  }, [handle, tab]);

  useEffect(() => { if (can(me, 'trainers.view')) void load(); }, [load, me]);

  if (!can(me, 'trainers.view')) return null;
  const canDecide = can(me, 'trainers.status');

  async function decide() {
    if (!open) return;
    setBusy(true);
    try {
      if (open.decision === 'approve') await approveContactRequest(open.row.id, note.trim() || undefined);
      else await rejectContactRequest(open.row.id, note.trim());
      setOpen(null);
      setNote('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(handle(err) || null);
      setOpen(null);
    } finally {
      setBusy(false);
    }
  }

  const kindLabel = (r: TrainerContactRequest) => (r.kind === 'email' ? 'Email' : 'Mobile');
  return (
    <>
      <div className="pagehead" style={{ marginTop: 4 }}>
        <div>
          <h2 style={{ margin: 0 }}>Trainers asking to change their details</h2>
          <p>Trainers ask here to change their email or mobile number. A trainer&apos;s email is also how they sign in, so first check it is really them (a call to the number we have is best), then approve. Nothing changes until you approve.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button className={`btn ${tab === 'pending' ? '' : 'ghost'}`} type="button" onClick={() => setTab('pending')}>Waiting{data && tab === 'pending' ? ` · ${data.pending}` : ''}</button>
        <button className={`btn ${tab === 'all' ? '' : 'ghost'}`} type="button" onClick={() => setTab('all')}>All</button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!data && !error ? (
        <PageLoader />
      ) : data && data.requests.length === 0 ? (
        <Banner tone="info">{tab === 'pending' ? 'Nothing waiting. All requests are handled.' : 'No requests yet.'}</Banner>
      ) : data ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead><tr><th>Trainer</th><th>Change</th><th className="hide-sm">Reason</th><th>When</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.applicationId ? <Link href={`/applications/${r.applicationId}`}><b>{r.trainerName}</b></Link> : <b>{r.trainerName}</b>}</td>
                  <td>
                    <b>{kindLabel(r)}</b>
                    <div className="sub muted small">{r.oldValue ?? '—'} → <b>{r.newValue}</b></div>
                  </td>
                  <td className="hide-sm muted">{r.reason ?? '—'}</td>
                  <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{when(r.createdAt)}</td>
                  <td>
                    <span className={`pill ${PILL[r.status]}`}>{LABEL[r.status]}</span>
                    {r.status !== 'pending' && r.decidedByName ? <div className="sub muted small">{r.decidedByName}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</div> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {r.status === 'pending' && canDecide ? (
                      <>
                        <button className="btn ghost" type="button" onClick={() => { setOpen({ row: r, decision: 'reject' }); setNote(''); }}>Reject</button>{' '}
                        <button className="btn" type="button" onClick={() => { setOpen({ row: r, decision: 'approve' }); setNote(''); }}>Approve</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>{open.decision === 'approve' ? 'Approve' : 'Reject'}: {open.row.trainerName}</h2>
            <p className="muted">{kindLabel(open.row)}: {open.row.oldValue ?? '—'} → <b>{open.row.newValue}</b></p>
            {open.decision === 'approve' ? (
              <p>{open.row.kind === 'email'
                ? 'This trainer will sign in with the new email from now on, and a notice goes to both addresses. Check the spelling and that you have confirmed it with them.'
                : 'Their mobile number on Zoove changes right away. Check you have confirmed it with them.'}</p>
            ) : (
              <p>The trainer is told it was not changed, with your reason.</p>
            )}
            <div className="field full">
              <label>
                <span>{open.decision === 'approve' ? 'Note for the record (optional)' : 'Reason the trainer will see'}</span>
                <input value={note} maxLength={300} placeholder={open.decision === 'approve' ? 'e.g. Called on the old number, confirmed' : 'e.g. We could not reach you to confirm'} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(null)}>Close</button>
              <button className="btn" type="button" disabled={busy || (open.decision === 'reject' && note.trim().length < 3)} onClick={() => void decide()}>
                {busy ? <Spinner /> : null} {open.decision === 'approve' ? 'Approve change' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
