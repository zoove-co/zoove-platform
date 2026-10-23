'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { listServices, type ApplicationView, type Service } from '@/lib/api';
import { FALLBACK_SERVICES } from '@/lib/steps';

function Badge({ tone }: { tone: 'good' | 'wait' | 'hold' | 'no' }) {
  const path = tone === 'good' ? 'M5 12.5l4.5 4.5L19 7.5' : tone === 'wait' ? 'M12 7v5l3 2' : tone === 'hold' ? 'M9 7v10M15 7v10' : 'M7 7l10 10M17 7L7 17';
  return (
    <span className={`badge ${tone}`} aria-hidden>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

function Hero({ tone, title, children }: { tone: 'good' | 'wait' | 'hold' | 'no'; title: string; children: ReactNode }) {
  return (
    <section className="statushero">
      <Badge tone={tone} />
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}

function Profile({ rows, name, note }: { rows: [string, string][]; name: string; note?: string }) {
  return (
    <div className="card summary profile">
      <div className="profile-head">
        <span className="avatar" aria-hidden>{name.trim().charAt(0).toUpperCase() || 'Z'}</span>
        <b>Your profile</b>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="muted small" style={{ margin: '14px 0 0' }}>{note}</p> : null}
    </div>
  );
}

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
        <Hero tone="hold" title={heading}>Hi {name}, please contact the Zoove team to find out more. Your details below are kept as they were.</Hero>
        <Profile rows={rows} name={name} />
      </>
    );
  }
  return (
    <>
      <Hero tone="good" title={`You are approved, ${name}!`}>Welcome to Zoove. Your KYC is verified and you are part of our trainer network.</Hero>
      <div className="card soft">
        <b>What happens next</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          You do not need to do anything now. We will email you at <b>{f.email}</b> with the next steps, including when the trainer app is ready. You can come back to this page any time with the same email.
        </p>
      </div>
      <Profile rows={rows} name={name} note="To change any of these details, contact the Zoove team." />
    </>
  );
}

export function Status({ view }: { view: ApplicationView }) {
  const name = view.form.firstName ?? 'there';
  if (view.status === 'approved') return <Approved view={view} name={name} />;
  if (view.status === 'rejected') {
    return (
      <>
        <Hero tone="no" title="We cannot take this forward">Thank you for applying, {name}. We are not able to onboard you right now.</Hero>
        {view.reviewNote ? <div className="card soft"><b>Reason</b><p style={{ margin: '4px 0 0' }}>{view.reviewNote}</p></div> : null}
      </>
    );
  }
  // submitted or in review
  return (
    <>
      <Hero tone="wait" title="Application received">
        Thanks, {name}. The Zoove team is reviewing your details and documents. We will email you at <b>{view.form.email}</b> as soon as there is an update.
      </Hero>
      <div className="card soft">
        <b>{view.status === 'in_review' ? 'Under review' : 'Waiting for review'}</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          You do not need to do anything else. You can close this page and come back any time with the same email.
        </p>
      </div>
    </>
  );
}
