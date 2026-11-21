'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError, assignComplaint, complaintAssignees, getComplaint, listComplaints, noteOnComplaint, reopenComplaint, replyToComplaint, resolveComplaint,
  type ComplaintDetail, type ComplaintRow, type ComplaintSide, type ComplaintStatus, type ComplaintStatusFilter,
} from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, CallLink, Icons, PageLoader, Spinner } from './ui';

const STATUS_LABEL: Record<ComplaintStatus, string> = { open: 'Waiting for us', waiting_on_user: 'Waiting for them', resolved: 'Resolved' };
const STATUS_PILL: Record<ComplaintStatus, string> = { open: 'changes_requested', waiting_on_user: 'in_review', resolved: 'approved' };
const FILTERS: [ComplaintStatusFilter, string][] = [['active', 'Not resolved'], ['open', 'Waiting for us'], ['waiting_on_user', 'Waiting for them'], ['resolved', 'Resolved'], ['all', 'All']];
const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
// "5m", "3h", "2d": how long ago, for the list.
function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}
const REFRESH_MS = 10_000;

export function Complaints({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const canCustomers = can(me, 'complaints.customers');
  const canTrainers = can(me, 'complaints.trainers');
  const allowed = canCustomers || canTrainers;
  const [side, setSide] = useState<ComplaintSide | undefined>(undefined);
  const [status, setStatus] = useState<ComplaintStatusFilter>('active');
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState<ComplaintRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const listSeq = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const data = await listComplaints({ side, status, q: query, mine });
      if (seq === listSeq.current) { setRows(data); setError(null); }
    } catch (err) {
      if (seq === listSeq.current) setError(handle(err) || null);
    }
  }, [side, status, query, mine, handle]);

  // Search waits for a pause in typing. Everything else reloads at once.
  useEffect(() => {
    if (!allowed) return;
    const timer = setTimeout(() => void loadList(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [allowed, loadList, query]);
  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => { if (!document.hidden) void loadList(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [allowed, loadList]);
  useEffect(() => { if (allowed) complaintAssignees().then(setTeam).catch(() => undefined); }, [allowed]);
  // The link in an email or in Needs attention opens a complaint directly: /complaints?id=...
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setOpenId(id);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await getComplaint(id)); } catch (err) { setError(handle(err) || null); }
  }, [handle]);
  useEffect(() => {
    if (!openId || !allowed) { setDetail(null); return; }
    setDetail((current) => (current?.id === openId ? current : null));
    setDraft(''); setMode('reply'); setResolving(false); setResolution(''); setFormError(null); lastCount.current = 0;
    void loadDetail(openId);
    const timer = setInterval(() => { if (!document.hidden) void loadDetail(openId); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [openId, allowed, loadDetail]);
  // Scroll to the newest message when a thread opens or a message arrives.
  useEffect(() => {
    if (detail && detail.messages.length !== lastCount.current) { lastCount.current = detail.messages.length; endRef.current?.scrollIntoView({ block: 'nearest' }); }
  }, [detail]);

  const select = (id: string) => { setOpenId(id); window.history.replaceState(null, '', `/complaints?id=${id}`); };
  const closeThread = () => { setOpenId(null); setDetail(null); window.history.replaceState(null, '', '/complaints'); };

  if (!allowed) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Complaints</h1></div></div>
        <Banner tone="info">You do not have access to complaints. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function run(action: () => Promise<ComplaintDetail>, after?: () => void) {
    setBusy(true); setFormError(null);
    try {
      setDetail(await action());
      after?.();
      void loadList();
    } catch (err) {
      setFormError(handle(err) || null);
    } finally {
      setBusy(false);
    }
  }
  const send = () => {
    const text = draft.trim();
    if (!detail || !text) return;
    void run(() => (mode === 'reply' ? replyToComplaint(detail.id, text) : noteOnComplaint(detail.id, text)), () => setDraft(''));
  };

  const waiting = rows?.filter((r) => r.status === 'open').length ?? 0;
  const sessionLink = detail?.session ? `/sessions?code=${encodeURIComponent(detail.session.code)}` : null;
  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Complaints</h1>
          <p>Customers and trainers raise complaints in the app. Each one is its own conversation: read it, reply, and resolve it when it is sorted. They get a notification when you reply.</p>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <div className="toolbar">
        <div className="search">
          {Icons.search}
          <input value={query} placeholder="Search by ZC code, session code, name or phone" aria-label="Search complaints" onChange={(e) => setQuery(e.target.value)} />
        </div>
        {canCustomers && canTrainers ? (
          <>
            <button type="button" className="chipbtn" aria-pressed={side === undefined} onClick={() => setSide(undefined)}>Everyone</button>
            <button type="button" className="chipbtn" aria-pressed={side === 'customer'} onClick={() => setSide('customer')}>Customers</button>
            <button type="button" className="chipbtn" aria-pressed={side === 'trainer'} onClick={() => setSide('trainer')}>Trainers</button>
          </>
        ) : null}
        <button type="button" className="chipbtn" aria-pressed={mine} onClick={() => setMine((v) => !v)}>Assigned to me</button>
      </div>
      <div className="toolbar">
        {FILTERS.map(([key, label]) => <button key={key} type="button" className="chipbtn" aria-pressed={status === key} onClick={() => setStatus(key)}>{label}{key === 'active' && waiting > 0 ? ` · ${waiting} waiting for us` : ''}</button>)}
      </div>

      <div className={`cmp${openId ? ' open' : ''}`}>
        <div className="panel cmp-list">
          {!rows && !error ? <PageLoader /> : null}
          {rows && rows.length === 0 ? <div className="cmp-empty">{query || side || mine || status !== 'active' ? 'No complaints match.' : 'No complaints waiting. Nice.'}</div> : null}
          {rows?.map((row) => (
            <button key={row.id} type="button" className="cmp-item" aria-current={row.id === openId ? 'true' : undefined} onClick={() => select(row.id)}>
              <span className="top">
                <span className="who">{row.personName}</span>
                <span className="when">{ago(row.lastMessageAt)}</span>
              </span>
              <span className="line">{row.lastMessage ? `${row.lastMessage.from === 'user' ? '' : row.lastMessage.from === 'admin' ? 'Zoove: ' : ''}${row.lastMessage.body}` : row.subject}</span>
              <span className="meta">
                <span className={`pill ${STATUS_PILL[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                {row.urgent ? <span className="tag urgent">Safety</span> : null}
                {canCustomers && canTrainers ? <span className={`tag ${row.side}`}>{row.side === 'trainer' ? 'Trainer' : 'Customer'}</span> : null}
                <span>{row.code}</span>
                {row.assignedToName ? <span>· {row.assignedToName}</span> : null}
              </span>
            </button>
          ))}
        </div>

        <div className="panel cmp-thread">
          {!openId ? <div className="cmp-empty">Choose a complaint to read the conversation.</div> : !detail ? <PageLoader /> : (
            <>
              <div className="cmp-head">
                <div className="row">
                  <button type="button" className="btn ghost small" onClick={closeThread}>{Icons.back} Close</button>
                  <span className={`pill ${STATUS_PILL[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
                  {detail.urgent ? <span className="tag urgent">Safety</span> : null}
                  <span className={`tag ${detail.side}`}>{detail.side === 'trainer' ? 'Trainer' : 'Customer'}</span>
                  <span className="muted small">{detail.code} · opened {stamp(detail.createdAt)}</span>
                </div>
                <h2>{detail.categoryLabel}</h2>
                <div className="row">
                  <b>{detail.person.name}</b>
                  <CallLink phone={detail.person.phone} label="Call" small />
                  <span className="muted small">{detail.person.complaintsTotal} complaint{detail.person.complaintsTotal === 1 ? '' : 's'} in all{detail.person.complaintsOpen > 1 ? `, ${detail.person.complaintsOpen} not resolved` : ''}</span>
                </div>
                <div className="row">
                  <label className="muted small" htmlFor="assignee">Handled by</label>
                  <select id="assignee" style={{ width: 'auto', minWidth: 160 }} value={detail.assignedToId ?? ''} disabled={busy} onChange={(e) => void run(() => assignComplaint(detail.id, e.target.value || null))}>
                    <option value="">Nobody yet</option>
                    {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {detail.status === 'resolved'
                    ? <button type="button" className="btn ghost small" disabled={busy} onClick={() => void run(() => reopenComplaint(detail.id))}>Reopen</button>
                    : <button type="button" className="btn small" disabled={busy} onClick={() => setResolving((v) => !v)}>Resolve…</button>}
                </div>
              </div>

              {detail.session ? (
                <div className="cmp-card">
                  <div><b>{detail.session.serviceName}</b> · <Link href={sessionLink ?? '/sessions'}>{detail.session.code}</Link> · {detail.session.status}{detail.session.startsAt ? ` · ${stamp(detail.session.startsAt)}` : ' · as soon as possible'}{detail.session.area ? ` · ${detail.session.area}` : ''}</div>
                  <div>Customer: {detail.session.customerName ?? '—'} <CallLink phone={detail.session.customerPhone} label="Call" small /></div>
                  <div>Trainer: {detail.session.trainerName ?? 'none assigned'} <CallLink phone={detail.session.trainerPhone} label="Call" small /></div>
                  {detail.related.length > 0 ? (
                    <div>Also raised about this session: {detail.related.map((r) => <button key={r.id} type="button" className="chipbtn" style={{ marginRight: 6 }} onClick={() => select(r.id)}>{r.side === 'trainer' ? 'Trainer' : 'Customer'} · {r.code}</button>)}</div>
                  ) : null}
                </div>
              ) : <div className="cmp-card muted">Not about a particular session.</div>}

              <div className="cmp-msgs" aria-live="polite">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`cmp-msg ${m.internal ? 'note' : m.from === 'admin' ? 'team' : m.from === 'system' ? 'system' : ''}`}>
                    {m.from !== 'system' ? <span className="by">{m.internal ? `Private note · ${m.authorName ?? 'Team'} (not shown to them)` : m.from === 'admin' ? `${m.authorName ?? 'Team'} · sent to them` : detail.person.name}</span> : null}
                    {m.body}
                    <span className="at">{stamp(m.createdAt)}</span>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {formError ? <div style={{ padding: '0 18px' }}><Banner tone="bad">{formError}</Banner></div> : null}
              {resolving && detail.status !== 'resolved' ? (
                <div className="cmp-compose">
                  <label htmlFor="resolution" className="muted small">What was done? They read this as the last message.</label>
                  <textarea id="resolution" value={resolution} maxLength={1000} placeholder="Example: We refunded the extra charge. It will reach your account in 3 to 5 days." onChange={(e) => setResolution(e.target.value)} />
                  <div className="tools">
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => setResolving(false)}>Not yet</button>
                    <button type="button" className="btn" disabled={busy || resolution.trim().length < 3} onClick={() => void run(() => resolveComplaint(detail.id, resolution.trim()), () => { setResolving(false); setResolution(''); })}>{busy ? <Spinner /> : null} Resolve and tell them</button>
                  </div>
                </div>
              ) : detail.status === 'resolved' ? (
                <div className="cmp-compose"><span className="muted small">Resolved{detail.resolvedByName ? ` by ${detail.resolvedByName}` : ''}{detail.resolvedAt ? ` on ${stamp(detail.resolvedAt)}` : ''}. Reopen it to write again. If they reply within 7 days it reopens by itself.</span></div>
              ) : (
                <div className="cmp-compose">
                  <div className="seg-btn" style={{ margin: 0, justifySelf: 'start' }}>
                    <button type="button" aria-pressed={mode === 'reply'} onClick={() => setMode('reply')}>Reply to {detail.person.name.split(' ')[0]}</button>
                    <button type="button" aria-pressed={mode === 'note'} onClick={() => setMode('note')}>Private note</button>
                  </div>
                  <textarea value={draft} maxLength={2000} aria-label={mode === 'reply' ? 'Your reply' : 'Private note'} placeholder={mode === 'reply' ? 'Write to them. They get a notification.' : 'A note for the team. They will not see it.'} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
                  <div className="tools">
                    <span className="muted small">{mode === 'reply' ? 'Sent to them and they are notified.' : 'Only the team can read this.'} Ctrl+Enter sends.</span>
                    <button type="button" className="btn" disabled={busy || draft.trim().length === 0} onClick={send}>{busy ? <Spinner /> : null} {mode === 'reply' ? 'Send reply' : 'Save note'}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
