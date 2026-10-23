'use client';

import { useEffect, useState } from 'react';

import { listServices, type ApplicationView, type Service } from '@/lib/api';
import { FALLBACK_SERVICES } from '@/lib/steps';

function Approved({ view, name }: { view: ApplicationView; name: string }) {
  const [services, setServices] = useState<Service[]>(FALLBACK_SERVICES);
  useEffect(() => {
    listServices().then(setServices).catch(() => undefined);
  }, []);
  const f = view.form;
  const serviceName = (slug: string) => services.find((item) => item.slug === slug)?.name ?? slug;
  const rows: [string, string][] = [
    ['Name', [f.firstName, f.lastName].filter(Boolean).join(' ') || '—'],
    ['Email', f.email ?? '—'],
    ['Mobile', f.phone ?? '—'],
    ['Trains', f.specialties.map(serviceName).join(', ') || '—'],
    ['Experience', f.experienceYears != null ? `${f.experienceYears} years` : '—'],
    ['Languages', f.languages.join(', ') || '—'],
    ['Area', [f.addressArea, f.addressCity].filter(Boolean).join(', ') || '—'],
  ];
  const held = view.trainerStatus && view.trainerStatus !== 'active' ? view.trainerStatus : null;
  if (held) {
    const heading = held === 'paused' ? 'Your account is paused' : held === 'suspended' ? 'Your account is suspended' : 'Your trainer account is no longer active';
    return (
      <>
        <div className="center">
          <div className="bigicon">⏸️</div>
          <h1>{heading}</h1>
          <p className="muted">Hi {name}, please contact the Zoove team to find out more. Your details below are kept as they were.</p>
        </div>
        <div className="card summary">
          <b>Your profile</b>
          <dl style={{ marginTop: 10 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="center">
        <div className="bigicon">🎉</div>
        <h1>You are approved, {name}!</h1>
        <p className="muted">Welcome to Zoove. Your KYC is verified and you are part of our trainer network.</p>
      </div>
      <div className="card soft">
        <b>What happens next</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          You do not need to do anything now. We will email you at <b>{f.email}</b> with the next steps, including when the trainer app is ready. You can come back to this page any time with the same email.
        </p>
      </div>
      <div className="card summary">
        <b>Your profile</b>
        <dl style={{ marginTop: 10 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small" style={{ margin: '12px 0 0' }}>To change any of these details, contact the Zoove team.</p>
      </div>
    </>
  );
}

export function Status({ view }: { view: ApplicationView }) {
  const name = view.form.firstName ?? 'there';
  if (view.status === 'approved') return <Approved view={view} name={name} />;
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
