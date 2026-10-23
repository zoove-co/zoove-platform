'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, KIND_LABEL, STATUS_LABEL, approve, nice, documentLink, getApplication, reject, requestChanges, startReview, type Detail as DetailData } from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Field, Icons, Spinner, avatarTone, initials } from './ui';

type Dialog = null | 'approve' | 'reject' | 'changes';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';

const EVENT_LABEL: Record<string, string> = {
  submitted: 'Submitted by the applicant',
  resubmitted: 'Resubmitted after changes',
  review_started: 'Review started',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
  created: 'Application started',
  document_uploaded: 'Document uploaded',
  document_removed: 'Document removed',
  document_viewed: 'Document viewed',
};

export function Detail({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const canDocs = can(me, 'trainers.documents');
  const canDecide = can(me, 'trainers.decide');
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const handle = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') {
        expired();
        return '';
      }
      return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    },
    [expired],
  );

  const load = useCallback(async () => {
    try {
      setData(await getApplication(id));
      setError(null);
    } catch (err) {
      setError(handle(err) || null);
    }
  }, [id, handle]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDocument(documentId: string) {
    setDocError(null);
    setOpening(documentId);
    // Open the tab first (inside the click), then point it at the short-lived link. Otherwise pop-up blockers stop it.
    const tab = window.open('', '_blank');
    try {
      const link = await documentLink(id, documentId);
      if (tab) tab.location.href = link.url;
      else setDocError('Your browser blocked the new tab. Allow pop-ups for this site and try again.');
    } catch (err) {
      tab?.close();
      setDocError(handle(err) || null);
    } finally {
      setOpening(null);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFieldError(null);
    try {
      await action();
      setDialog(null);
      setNote('');
      setPicked([]);
      await load();
    } catch (err) {
      const message = handle(err);
      if (message) setFieldError(message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <Shell signOut={signOut}>
        <Link href="/" className="crumb">{Icons.back} Trainers</Link>
        <Banner tone="bad">{error}</Banner>
        <button className="btn" type="button" onClick={() => void load()}>Try again</button>
      </Shell>
    );
  }
  if (!data) return <div className="center" style={{ padding: 60 }}><Spinner /></div>;

  const f = data.form;
  const reviewable = data.status === 'submitted' || data.status === 'in_review';
  const name = `${f.firstName ?? ''} ${f.lastName ?? ''}`.trim() || 'Applicant';
  const visibleDocs = data.documents;
  const docIcon = (kind: string) => (kind.startsWith('aadhaar') ? Icons.id : kind === 'pan_card' ? Icons.card : kind === 'selfie' ? Icons.face : Icons.file);

  return (
    <Shell signOut={signOut}>
      <Link href="/" className="crumb">{Icons.back} Trainers</Link>
      <div className="who-head">
        <span className={`avatar lg ${avatarTone(name)}`}>{initials(name)}</span>
        <div>
          <h1>{name}</h1>
          <div className="meta">
            <span className={`pill ${data.status}`}>{STATUS_LABEL[data.status] ?? data.status}</span>
            <span style={{ marginLeft: 10 }}>Submitted {when(data.submittedAt)}{data.source ? ` · via ${data.source}` : ''}</span>
          </div>
        </div>
      </div>
      {data.reviewNote && !reviewable ? <Banner tone="info"><b>Last decision note:</b> {data.reviewNote}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <div className="grid2">
        <div>
          <div className="card">
            <h2>Details</h2>
            <dl className="kv">
              <dt>Mobile (not verified)</dt><dd>{data.phone ?? '—'}</dd>
              <dt>Email (verified)</dt><dd>{f.email ?? '—'}</dd>
              <dt>Date of birth</dt><dd>{f.dateOfBirth ?? '—'}</dd>
              <dt>Gender</dt><dd>{f.gender?.replace(/_/g, ' ') ?? '—'}</dd>
              <dt>Address</dt><dd>{[f.addressLine, f.addressArea, `${f.addressCity} ${f.addressPincode ?? ''}`].filter(Boolean).join(', ')}</dd>
              <dt>Trains</dt><dd>{f.specialties.map(nice).join(', ') || '—'}</dd>
              <dt>Experience</dt><dd>{f.experienceYears === null ? '—' : `${f.experienceYears} years`}</dd>
              <dt>Languages</dt><dd>{f.languages.join(', ') || '—'}</dd>
              <dt>About</dt><dd>{f.bio ?? '—'}</dd>
              <dt>PAN</dt><dd>{f.panLast4 ? `ends ${f.panLast4}` : '—'}</dd>
              <dt>Aadhaar</dt><dd>{f.aadhaarLast4 ? `ends ${f.aadhaarLast4}` : '—'}</dd>
            </dl>
          </div>

          <div className="card">
            <h2>Documents</h2>
            <p className="muted small">
              {canDocs ? 'Each opens in a new tab with a private link that expires in 5 minutes. Every view is recorded.' : 'You can see which documents were uploaded, but opening them needs the "View KYC documents" permission. Ask an owner.'}
            </p>
            {docError ? <Banner tone="bad">{docError}</Banner> : null}
            {visibleDocs.length === 0 ? <p className="muted">No documents.</p> : null}
            <div className="docs">
              {visibleDocs.map((doc) => (
                <div className="doc" key={doc.id}>
                  <div className="top">
                    <span className="ico">{docIcon(doc.kind)}</span>
                    <div>
                      <div className="name">{KIND_LABEL[doc.kind] ?? doc.kind}</div>
                      <div className={`state ${doc.status === 'rejected' ? 'bad' : doc.status === 'accepted' ? 'ok' : ''}`}>
                        {doc.status === 'rejected' ? `Needs re-upload${doc.note ? `: ${doc.note}` : ''}` : doc.status === 'accepted' ? 'Accepted' : 'Uploaded'} · {when(doc.uploadedAt)}
                      </div>
                    </div>
                  </div>
                  {canDocs ? (
                    <button className="btn small ghost" type="button" disabled={opening === doc.id} onClick={() => void openDocument(doc.id)}>
                      {opening === doc.id ? <Spinner /> : 'View document'}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {data.status === 'approved' ? (
            <div className="card">
              <h2>Sessions</h2>
              <div className="seg" aria-hidden><span>Active</span><span>Upcoming</span><span>Past</span></div>
              <div className="empty-note">This trainer&apos;s sessions will appear here once bookings can be assigned to trainers. Coming soon.</div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>History</h2>
          {data.events.length === 0 ? <p className="muted">Nothing yet.</p> : null}
          <ul className="timeline">
            {[...data.events].reverse().map((event, index) => {
              const text = (event.payload.note ?? event.payload.reason) as string | undefined;
              return (
                <li key={`${event.at}-${index}`} className={`ev-${event.type}`}>
                  <b>{EVENT_LABEL[event.type] ?? event.type.replace(/_/g, ' ')}</b>
                  {text ? <div className="note">“{text}”</div> : null}
                  <div className="when">{when(event.at)} · {event.actor}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {reviewable && canDecide ? (
        <div className="decision">
          {data.status === 'submitted' ? (
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(() => startReview(id))}>Start review</button>
          ) : null}
          <button className="btn danger" type="button" disabled={busy} onClick={() => { setDialog('reject'); setFieldError(null); }}>Reject</button>
          <button className="btn soft" type="button" disabled={busy} onClick={() => { setDialog('changes'); setFieldError(null); }}>Request changes</button>
          <button className="btn good" type="button" disabled={busy} onClick={() => { setDialog('approve'); setFieldError(null); }}>Approve</button>
        </div>
      ) : null}

      {dialog && canDecide ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            {dialog === 'approve' ? (
              <>
                <h2>Approve {name}?</h2>
                <p className="muted">This makes them a Zoove trainer and emails them. Please check the documents against the details first.</p>
                <Field label="Note (optional)"><textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </>
            ) : null}
            {dialog === 'reject' ? (
              <>
                <h2>Reject {name}?</h2>
                <p className="muted">This is final and the applicant is emailed the reason.</p>
                <Field label="Reason" error={fieldError ?? undefined}><textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(fieldError)} /></Field>
              </>
            ) : null}
            {dialog === 'changes' ? (
              <>
                <h2>Request changes</h2>
                <p className="muted">The applicant is emailed and can edit and resubmit.</p>
                <Field label="What needs to change?" error={fieldError ?? undefined}><textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(fieldError)} /></Field>
                <p className="small"><b>Documents to re-upload</b></p>
                {data.documents.filter((doc) => doc.kind !== 'certificate' && doc.kind !== 'other').map((doc) => (
                  <label className="check" key={doc.id}>
                    <input type="checkbox" checked={picked.includes(doc.id)} onChange={() => setPicked((cur) => (cur.includes(doc.id) ? cur.filter((x) => x !== doc.id) : [...cur, doc.id]))} />
                    <span>{KIND_LABEL[doc.kind] ?? doc.kind}</span>
                  </label>
                ))}
              </>
            ) : null}
            {fieldError && dialog === 'approve' ? <Banner tone="bad">{fieldError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button>
              <button
                className={`btn ${dialog === 'reject' ? 'danger solid' : dialog === 'approve' ? 'good' : ''}`}
                type="button"
                disabled={busy || (dialog !== 'approve' && note.trim().length < 3)}
                onClick={() =>
                  void run(() => (dialog === 'approve' ? approve(id, note.trim() || undefined) : dialog === 'reject' ? reject(id, note.trim()) : requestChanges(id, note.trim(), picked)))
                }
              >
                {busy ? <Spinner /> : null} {dialog === 'approve' ? 'Approve' : dialog === 'reject' ? 'Reject' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
