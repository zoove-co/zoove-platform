'use client';

import type { ApplicationView } from '@/lib/api';

export function Status({ view }: { view: ApplicationView }) {
  const name = view.form.firstName ?? 'there';
  if (view.status === 'approved') {
    return (
      <div className="center">
        <div className="bigicon">🎉</div>
        <h1>You are approved, {name}!</h1>
        <p className="muted">Welcome to Zoove. The team will be in touch with the next steps.</p>
      </div>
    );
  }
  if (view.status === 'rejected') {
    return (
      <div className="center">
        <div className="bigicon">🙏</div>
        <h1>We cannot take this forward</h1>
        <p className="muted">Thank you for applying, {name}. We are not able to onboard you right now.</p>
        {view.reviewNote ? <div className="card soft" style={{ textAlign: 'left' }}><b>Reason</b><p style={{ margin: '4px 0 0' }}>{view.reviewNote}</p></div> : null}
      </div>
    );
  }
  // submitted or in review
  return (
    <div className="center">
      <div className="bigicon">✅</div>
      <h1>Application received</h1>
      <p className="muted">
        Thanks, {name}. The Zoove team is reviewing your details and documents. We will email you at <b>{view.form.email}</b> as soon as there is an update.
      </p>
      <div className="card soft" style={{ textAlign: 'left' }}>
        <b>{view.status === 'in_review' ? 'Under review' : 'Waiting for review'}</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          You do not need to do anything else. You can close this page and come back any time with the same email.
        </p>
      </div>
    </div>
  );
}
