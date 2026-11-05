'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  ApiError, createFormat, createService, getOfferings, setParticipantRule, setPrice, updateFormat, updateService,
  type AdminFormat, type AdminService, type BookingModeKey, type Offerings as OfferingsData,
} from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Field, Spinner } from './ui';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const MODES: [BookingModeKey, string, string][] = [
  ['scheduled', 'Scheduled', 'Booked for a time the customer picks.'],
  ['instant', 'Instant', 'A trainer as soon as possible.'],
  ['demo', 'Demo', 'The first, trial session.'],
];
const GROUPS: [string, string][] = [['duo', 'Duo (two people)'], ['loved_one', 'Loved one (a session for someone else)'], ['group', 'Group (three or more)']];

type SvcDraft = { id: string | null; slug: string; name: string; tagline: string; min: string; max: string; intensity: string; sort: string; active: boolean };
type FmtDraft = { serviceId: string; id: string | null; slug: string; name: string; description: string; sort: string; active: boolean };

const svcDraft = (s?: AdminService): SvcDraft => s
  ? { id: s.id, slug: s.slug, name: s.name, tagline: s.tagline ?? '', min: String(s.durationMinMinutes), max: String(s.durationMaxMinutes), intensity: s.intensity ?? '', sort: String(s.sortOrder), active: s.isActive }
  : { id: null, slug: '', name: '', tagline: '', min: '45', max: '60', intensity: '', sort: '0', active: true };

export function Offerings({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [data, setData] = useState<OfferingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [svc, setSvc] = useState<SvcDraft | null>(null);
  const [fmt, setFmt] = useState<FmtDraft | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Record<string, { percent: string; perHead: boolean }>>({});
  const [own, setOwn] = useState<Record<string, string>>({});

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const fill = useCallback((d: OfferingsData) => {
    setData(d);
    setDefaults(Object.fromEntries(MODES.map(([m]) => [m, d.defaultPrices[m] ? String(d.defaultPrices[m]!.pricePaise / 100) : ''])));
    setRules(Object.fromEntries(d.participants.map((p) => [p.participant, { percent: String(p.percent), perHead: p.perHead }])));
    setOwn(Object.fromEntries(d.services.flatMap((s) => MODES.map(([m]) => [`${s.id}:${m}`, s.ownPrices[m] ? String(s.ownPrices[m]!.pricePaise / 100) : '']))));
  }, []);

  const load = useCallback(async () => {
    try { fill(await getOfferings()); setError(null); } catch (err) { setError(handle(err) || null); }
  }, [fill, handle]);
  useEffect(() => { if (can(me, 'catalog.manage')) void load(); }, [load, me]);

  if (!can(me, 'catalog.manage')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Offerings</h1></div></div>
        <Banner tone="info">You do not have access to offerings. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true); setFormError(null); setError(null);
    try { await action(); setSaved(label); setSvc(null); setFmt(null); await load(); }
    catch (err) { const m = handle(err); if (m) { setFormError(m); setError(m); } } finally { setBusy(false); }
  }
  const price = (text: string): number | null | 'bad' => {
    if (text.trim() === '') return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) : 'bad';
  };
  function saveDefault(mode: BookingModeKey) {
    const p = price(defaults[mode] ?? '');
    if (p === null || p === 'bad') return setError('Enter the default price in rupees.');
    void run('Default price saved', () => setPrice(null, mode, p));
  }
  function saveOwn(serviceId: string, mode: BookingModeKey) {
    const p = price(own[`${serviceId}:${mode}`] ?? '');
    if (p === 'bad') return setError('Enter the price in rupees, or leave it empty to use the default.');
    void run(p === null ? 'Back to the default price' : 'Price saved', () => setPrice(serviceId, mode, p));
  }
  function saveRule(participant: string) {
    const r = rules[participant]; const percent = Number(r?.percent);
    if (!r || !Number.isInteger(percent) || percent < 1 || percent > 1000) return setError('Enter a whole percent between 1 and 1000.');
    void run('Price rule saved', () => setParticipantRule(participant, percent, r.perHead));
  }
  function storeService() {
    if (!svc) return;
    const min = Number(svc.min), max = Number(svc.max), sort = Number(svc.sort);
    if (!svc.name.trim()) return setFormError('Give the service a name.');
    if (!svc.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(svc.slug.trim().toLowerCase())) return setFormError('The web name uses lowercase letters, numbers and dashes, for example pilates.');
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 10 || max < min || max > 240) return setFormError('Lengths are whole minutes, and the longest cannot be shorter than the shortest.');
    if (!Number.isInteger(sort) || sort < 0) return setFormError('Order is a whole number, 0 or more.');
    const input = { name: svc.name.trim(), tagline: svc.tagline.trim() || null, durationMinMinutes: min, durationMaxMinutes: max, intensity: svc.intensity.trim() || null, sortOrder: sort, isActive: svc.active };
    void run('Service saved', () => (svc.id ? updateService(svc.id, input) : createService(svc.slug.trim().toLowerCase(), input)));
  }
  function storeFormat() {
    if (!fmt) return;
    const sort = Number(fmt.sort);
    if (!fmt.name.trim()) return setFormError('Give the style a name.');
    if (!fmt.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fmt.slug.trim().toLowerCase())) return setFormError('The web name uses lowercase letters, numbers and dashes, for example mat-pilates.');
    if (!Number.isInteger(sort) || sort < 0) return setFormError('Order is a whole number, 0 or more.');
    const input = { name: fmt.name.trim(), description: fmt.description.trim() || null, sortOrder: sort, isActive: fmt.active };
    void run('Style saved', () => (fmt.id ? updateFormat(fmt.serviceId, fmt.id, input) : createFormat(fmt.serviceId, fmt.slug.trim().toLowerCase(), input)));
  }
  const editFormat = (serviceId: string, f: AdminFormat) => { setFormError(null); setFmt({ serviceId, id: f.id, slug: f.slug, name: f.name, description: f.description ?? '', sort: String(f.sortOrder), active: f.isActive }); };

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Offerings</h1>
          <p>Everything customers see and pay for. A change here shows in the app straight away and applies to new bookings only; sessions already booked keep their price.</p>
        </div>
        <button className="btn" type="button" onClick={() => { setFormError(null); setSvc(svcDraft()); }}>New service</button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {saved && !error ? <Banner tone="good">{saved}.</Banner> : null}
      {!data && !error ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : null}

      {data ? (
        <>
          <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Default session prices</h2>
            <p className="muted small">Used for every service that has no price of its own. This is the Personal price (one person); Duo, Loved one and Group are worked out from it below.</p>
            <div className="fields">
              {MODES.map(([mode, label, hint]) => (
                <Field key={mode} label={`${label} (₹)`} hint={hint}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input inputMode="decimal" value={defaults[mode] ?? ''} onChange={(e) => setDefaults({ ...defaults, [mode]: e.target.value })} />
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => saveDefault(mode)}>Save</button>
                  </div>
                </Field>
              ))}
            </div>
          </section>

          <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Duo, Loved one and Group prices</h2>
            <p className="muted small">A share of the Personal price. For example 160% makes a ₹1,500 session ₹2,400. Group is charged per person. Prices are rounded to whole rupees.</p>
            {data.participants.some((p) => p.isPlaceholder) ? <Banner tone="warn">Some of these are still placeholder numbers, not agreed prices. Save a rule once the business has decided it.</Banner> : null}
            <div className="fields">
              {GROUPS.map(([key, label]) => {
                const meta = data.participants.find((p) => p.participant === key);
                const r = rules[key] ?? { percent: '', perHead: false };
                return (
                  <Field key={key} label={label} hint={meta?.isPlaceholder ? 'Placeholder' : 'Set by the team'}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input inputMode="numeric" value={r.percent} style={{ maxWidth: 90 }} onChange={(e) => setRules({ ...rules, [key]: { ...r, percent: e.target.value } })} />
                      <span className="muted">%</span>
                      <select value={r.perHead ? 'head' : 'total'} onChange={(e) => setRules({ ...rules, [key]: { ...r, perHead: e.target.value === 'head' } })}>
                        <option value="total">for everyone</option><option value="head">per person</option>
                      </select>
                      <button className="btn ghost" type="button" disabled={busy} onClick={() => saveRule(key)}>Save</button>
                    </div>
                  </Field>
                );
              })}
            </div>
          </section>

          {data.services.map((s) => (
            <section key={s.id} className="panel" style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{s.name} <span className={`pill ${s.isActive ? 'approved' : 'rejected'}`}>{s.isActive ? 'In the app' : 'Hidden'}</span></h2>
                  <div className="muted small">{s.tagline ?? 'No tagline'} · {s.durationMinMinutes}–{s.durationMaxMinutes} min{s.intensity ? ` · ${s.intensity.replace(/_/g, ' ')}` : ''} · web name {s.slug}</div>
                </div>
                <button className="btn ghost" type="button" onClick={() => { setFormError(null); setSvc(svcDraft(s)); }}>Edit service</button>
              </div>

              <h3 style={{ marginBottom: 4 }}>Prices for {s.name}</h3>
              <p className="muted small" style={{ marginTop: 0 }}>Leave empty to use the default price.</p>
              <div className="fields">
                {MODES.map(([mode, label]) => (
                  <Field key={mode} label={`${label} (₹)`} hint={s.ownPrices[mode] ? 'Own price' : data.defaultPrices[mode] ? `Default: ${rupees(data.defaultPrices[mode]!.pricePaise)}` : 'No price set'}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input inputMode="decimal" placeholder={data.defaultPrices[mode] ? String(data.defaultPrices[mode]!.pricePaise / 100) : ''} value={own[`${s.id}:${mode}`] ?? ''} onChange={(e) => setOwn({ ...own, [`${s.id}:${mode}`]: e.target.value })} />
                      <button className="btn ghost" type="button" disabled={busy} onClick={() => saveOwn(s.id, mode)}>Save</button>
                    </div>
                  </Field>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <h3 style={{ margin: 0 }}>Styles</h3>
                <button className="btn ghost" type="button" onClick={() => { setFormError(null); setFmt({ serviceId: s.id, id: null, slug: '', name: '', description: '', sort: String(s.formats.length * 10), active: true }); }}>Add a style</button>
              </div>
              {s.formats.length === 0 ? <p className="muted small">No styles yet. Customers cannot book a service without one.</p> : (
                <div className="tablewrap" style={{ marginTop: 8 }}>
                  <table className="list">
                    <tbody>
                      {s.formats.map((f) => (
                        <tr key={f.id}>
                          <td><b>{f.name}</b><div className="sub muted small">{f.description ?? 'No description'}</div></td>
                          <td><span className={`pill ${f.isActive ? 'approved' : 'rejected'}`}>{f.isActive ? 'In the app' : 'Hidden'}</span></td>
                          <td><button className="btn ghost" type="button" onClick={() => editFormat(s.id, f)}>Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </>
      ) : null}

      {svc ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet wide">
            <h2>{svc.id ? 'Edit service' : 'New service'}</h2>
            <div className="fields">
              <Field label="Name"><input value={svc.name} maxLength={60} onChange={(e) => setSvc({ ...svc, name: e.target.value })} /></Field>
              {svc.id ? <Field label="Web name" hint="Cannot be changed."><input value={svc.slug} disabled /></Field> : <Field label="Web name" hint="Lowercase, for example pilates. Cannot be changed later."><input value={svc.slug} maxLength={40} onChange={(e) => setSvc({ ...svc, slug: e.target.value })} /></Field>}
              <Field label="Tagline (optional)"><input value={svc.tagline} maxLength={120} onChange={(e) => setSvc({ ...svc, tagline: e.target.value })} /></Field>
              <Field label="Intensity (optional)" hint="For example low_moderate."><input value={svc.intensity} maxLength={30} onChange={(e) => setSvc({ ...svc, intensity: e.target.value })} /></Field>
              <Field label="Shortest session (minutes)"><input inputMode="numeric" value={svc.min} onChange={(e) => setSvc({ ...svc, min: e.target.value })} /></Field>
              <Field label="Longest session (minutes)"><input inputMode="numeric" value={svc.max} onChange={(e) => setSvc({ ...svc, max: e.target.value })} /></Field>
              <Field label="Order in the app" hint="Smaller comes first."><input inputMode="numeric" value={svc.sort} onChange={(e) => setSvc({ ...svc, sort: e.target.value })} /></Field>
              <Field label="Shown in the app">
                <select value={svc.active ? 'yes' : 'no'} onChange={(e) => setSvc({ ...svc, active: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">Hidden</option></select>
              </Field>
            </div>
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setSvc(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={storeService}>{busy ? <Spinner /> : null} Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {fmt ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet wide">
            <h2>{fmt.id ? 'Edit style' : 'New style'}</h2>
            <div className="fields">
              <Field label="Name"><input value={fmt.name} maxLength={60} onChange={(e) => setFmt({ ...fmt, name: e.target.value })} /></Field>
              {fmt.id ? <Field label="Web name" hint="Cannot be changed."><input value={fmt.slug} disabled /></Field> : <Field label="Web name" hint="Lowercase, for example mat-pilates."><input value={fmt.slug} maxLength={40} onChange={(e) => setFmt({ ...fmt, slug: e.target.value })} /></Field>}
              <Field label="Description (optional)"><input className="full" value={fmt.description} maxLength={300} onChange={(e) => setFmt({ ...fmt, description: e.target.value })} /></Field>
              <Field label="Order in the app"><input inputMode="numeric" value={fmt.sort} onChange={(e) => setFmt({ ...fmt, sort: e.target.value })} /></Field>
              <Field label="Shown in the app">
                <select value={fmt.active ? 'yes' : 'no'} onChange={(e) => setFmt({ ...fmt, active: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">Hidden</option></select>
              </Field>
            </div>
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setFmt(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={storeFormat}>{busy ? <Spinner /> : null} Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
