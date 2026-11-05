'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, cancelOrder, grantPackageException, listAdminPackages, listPackageOrders, markOrderPaid, packageExceptions, savePackage, type AdminPackage, type PackageException, type PackageOrder } from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Field, Spinner } from './ui';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const STATUS_LABEL = { awaiting_payment: 'Awaiting payment', paid: 'Paid', cancelled: 'Cancelled' } as const;
const STATUS_PILL = { awaiting_payment: 'changes_requested', paid: 'approved', cancelled: 'rejected' } as const;
const METHODS = [['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']] as const;

type PkgDraft = { id: string | null; name: string; sessions: string; price: string; original: string; validity: string; badge: string; active: boolean };
const NEW_PKG: PkgDraft = { id: null, name: '', sessions: '', price: '', original: '', validity: '60', badge: '', active: true };

export function Packages({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [tab, setTab] = useState<'orders' | 'packages'>('orders');
  const [orders, setOrders] = useState<PackageOrder[] | null>(null);
  const [packages, setPackages] = useState<AdminPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PackageOrder | null>(null);
  const [method, setMethod] = useState<string>('upi');
  const [reference, setReference] = useState('');
  const [pkg, setPkg] = useState<PkgDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<PackageOrder | null>(null);
  const [extraSessions, setExtraSessions] = useState('0');
  const [extendDays, setExtendDays] = useState('0');
  const [why, setWhy] = useState('');
  const [past, setPast] = useState<PackageException[]>([]);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([listPackageOrders(), listAdminPackages()]);
      setOrders(o); setPackages(p); setError(null);
    } catch (err) { setError(handle(err) || null); }
  }, [handle]);

  useEffect(() => { if (can(me, 'packages.manage')) void load(); }, [load, me]);

  if (!can(me, 'packages.manage')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Packages</h1></div></div>
        <Banner tone="info">You do not have access to packages. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function pay() {
    if (!paying) return;
    if (reference.trim().length < 2) return setFormError('Enter the payment reference (UPI id, bank reference or receipt number).');
    setBusy(true); setFormError(null);
    try { await markOrderPaid(paying.id, method, reference.trim()); setPaying(null); setReference(''); await load(); }
    catch (err) { const m = handle(err); if (m) setFormError(m); } finally { setBusy(false); }
  }
  async function openFix(order: PackageOrder) {
    setFix(order); setExtraSessions('0'); setExtendDays(order.expired ? '14' : '0'); setWhy(''); setFormError(null); setPast([]);
    try { setPast(await packageExceptions(order.id)); } catch { setPast([]); }
  }
  async function saveFix() {
    if (!fix) return;
    const sessions = Number(extraSessions); const days = Number(extendDays);
    if (!Number.isInteger(sessions) || sessions < 0 || sessions > 20) return setFormError('Extra sessions must be a whole number from 0 to 20.');
    if (!Number.isInteger(days) || days < 0 || days > 90) return setFormError('Extra days must be a whole number from 0 to 90.');
    if (sessions === 0 && days === 0) return setFormError('Add extra sessions, extra days, or both.');
    if (why.trim().length < 3) return setFormError('Write the reason. It is kept on the record.');
    setBusy(true); setFormError(null);
    try { await grantPackageException(fix.id, { extraSessions: sessions, extendDays: days, reason: why.trim() }); setFix(null); await load(); }
    catch (err) { const m = handle(err); if (m) setFormError(m); } finally { setBusy(false); }
  }
  async function dropOrder(order: PackageOrder) {
    try { await cancelOrder(order.id); await load(); } catch (err) { setError(handle(err) || null); }
  }
  async function storePackage() {
    if (!pkg) return;
    const sessions = Number(pkg.sessions); const price = Number(pkg.price); const original = pkg.original ? Number(pkg.original) : null;
    if (!pkg.name.trim()) return setFormError('Give the package a name.');
    if (!Number.isInteger(sessions) || sessions < 1) return setFormError('Sessions must be a whole number.');
    if (!(price >= 0) || pkg.price === '') return setFormError('Enter the price in rupees.');
    if (original !== null && original < price) return setFormError('The original price cannot be lower than the price.');
    if (pkg.validity && !(Number.isInteger(Number(pkg.validity)) && Number(pkg.validity) >= 1)) return setFormError('Valid for must be a whole number of days.');
    setBusy(true); setFormError(null);
    try {
      await savePackage(pkg.id, {
        name: pkg.name.trim(), sessionsCount: sessions, pricePaise: Math.round(price * 100), originalPricePaise: original === null ? null : Math.round(original * 100),
        validityDays: pkg.validity ? Number(pkg.validity) : null, badge: pkg.badge.trim() || null, isActive: pkg.active,
      });
      setPkg(null); await load();
    } catch (err) { const m = handle(err); if (m) setFormError(m); } finally { setBusy(false); }
  }

  const waiting = orders?.filter((o) => o.status === 'awaiting_payment').length ?? 0;
  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Packages</h1>
          <p>Customers order a package in the app. When the money has arrived, mark the order paid and their session credits switch on.</p>
        </div>
        {tab === 'packages' ? <button className="btn" type="button" onClick={() => { setPkg(NEW_PKG); setFormError(null); }}>New package</button> : null}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" className="chipbtn" aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>Orders{waiting ? ` (${waiting} waiting)` : ''}</button>
        <button type="button" className="chipbtn" aria-pressed={tab === 'packages'} onClick={() => setTab('packages')}>Package list</button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!orders && !error ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : null}

      {tab === 'orders' && orders ? (
        orders.length === 0 ? <Banner tone="info">No package orders yet.</Banner> : (
          <div className="panel tablewrap">
            <table className="list">
              <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><b>{o.name}</b><div className="sub muted small">{when(o.createdAt)}</div></td>
                    <td>{o.customer}</td>
                    <td>{rupees(o.totalPaise)}{o.discountPaise ? <div className="sub muted small">{o.discountCode}: −{rupees(o.discountPaise)}</div> : null}</td>
                    <td>
                      <span className={`pill ${STATUS_PILL[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                      {o.status === 'paid' ? (
                        <div className="sub muted small">
                          {o.expired ? `${o.creditsUnused} of ${o.creditsTotal} unused` : `${o.creditsLeft}/${o.creditsTotal} credits left`} · {o.paymentMethod} {o.paymentReference}
                          {o.expiresAt ? <div style={o.expired ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{o.expired ? 'Expired' : 'Valid until'} {day(o.expiresAt)}</div> : null}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {o.status === 'awaiting_payment' ? (
                        <>
                          <button className="btn" type="button" onClick={() => { setPaying(o); setReference(''); setFormError(null); }}>Mark paid</button>{' '}
                          <button className="btn ghost" type="button" onClick={() => void dropOrder(o)}>Cancel</button>
                        </>
                      ) : null}
                      {o.status === 'paid' && o.expiresAt ? <button className="btn ghost" type="button" onClick={() => void openFix(o)}>Grant exception</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === 'packages' && packages ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead><tr><th>Package</th><th>Price</th><th className="hide-sm">Valid for</th><th>Shown</th><th /></tr></thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b>{p.badge ? <span className="sub muted small"> · {p.badge}</span> : null}<div className="sub muted small">{p.sessionsCount} sessions</div></td>
                  <td>{rupees(p.pricePaise)}{p.originalPricePaise && p.originalPricePaise > p.pricePaise ? <span className="muted small"> (was {rupees(p.originalPricePaise)})</span> : null}</td>
                  <td className="hide-sm muted">{p.validityDays ? `${p.validityDays} days` : 'No expiry'}</td>
                  <td><span className={`pill ${p.isActive ? 'approved' : 'rejected'}`}>{p.isActive ? 'In the app' : 'Hidden'}</span></td>
                  <td><button className="btn ghost" type="button" onClick={() => { setFormError(null); setPkg({ id: p.id, name: p.name, sessions: String(p.sessionsCount), price: String(p.pricePaise / 100), original: p.originalPricePaise ? String(p.originalPricePaise / 100) : '', validity: p.validityDays ? String(p.validityDays) : '', badge: p.badge ?? '', active: p.isActive }); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {paying ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Mark {paying.name} as paid</h2>
            <p className="muted">{paying.customer} · {rupees(paying.totalPaise)}. Only do this once the money has arrived. Their {paying.sessionsCount} session credits switch on straight away.</p>
            <div className="fields">
              <Field label="How they paid">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </Field>
              <Field label="Payment reference" hint="UPI transaction id, bank reference or receipt number.">
                <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setPaying(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void pay()}>{busy ? <Spinner /> : null} Mark paid</button>
            </div>
          </div>
        </div>
      ) : null}

      {fix ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Grant an exception">
          <div className="sheet wide">
            <h2>Grant an exception: {fix.name}</h2>
            <p className="muted">
              {fix.customer} · {fix.expired ? `ended ${day(fix.expiresAt!)}` : `valid until ${day(fix.expiresAt!)}`} · {fix.creditsUnused} of {fix.creditsTotal} sessions unused.
              Use this when a customer could not use their package in time. The customer is told, and this is kept on the record.
            </p>
            <div className="fields">
              <Field label="Extra sessions" hint="Added to the package. Always add days too if it has ended."><input inputMode="numeric" value={extraSessions} onChange={(e) => setExtraSessions(e.target.value)} /></Field>
              <Field label="Extra days" hint={fix.expired ? 'Counted from today, because it has already ended.' : 'Added to the current end date.'}><input inputMode="numeric" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} /></Field>
              <Field label="Reason"><input value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="For example: trainer cancelled twice, customer was unwell" /></Field>
            </div>
            {past.length ? (
              <>
                <h3 style={{ marginBottom: 6 }}>Earlier exceptions</h3>
                <ul className="accesslist" style={{ marginTop: 0 }}>
                  {past.map((x) => <li key={x.id}>{when(x.at)} · {x.by} · {x.extraSessions ? `+${x.extraSessions} session${x.extraSessions > 1 ? 's' : ''} ` : ''}{x.extendDays ? `+${x.extendDays} days ` : ''}— “{x.reason}”</li>)}
                </ul>
              </>
            ) : null}
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setFix(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void saveFix()}>{busy ? <Spinner /> : null} Grant exception</button>
            </div>
          </div>
        </div>
      ) : null}

      {pkg ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet wide">
            <h2>{pkg.id ? 'Edit package' : 'New package'}</h2>
            <div className="fields">
              <Field label="Name"><input value={pkg.name} maxLength={80} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} /></Field>
              <Field label="Sessions"><input inputMode="numeric" value={pkg.sessions} onChange={(e) => setPkg({ ...pkg, sessions: e.target.value })} /></Field>
              <Field label="Price (₹)"><input inputMode="decimal" value={pkg.price} onChange={(e) => setPkg({ ...pkg, price: e.target.value })} /></Field>
              <Field label="Original price (₹, optional)" hint="Shown struck through."><input inputMode="decimal" value={pkg.original} onChange={(e) => setPkg({ ...pkg, original: e.target.value })} /></Field>
              <Field label="Valid for (days)" hint="Counted from the day payment is confirmed. We use 60. Sessions must start before this ends."><input inputMode="numeric" value={pkg.validity} onChange={(e) => setPkg({ ...pkg, validity: e.target.value })} /></Field>
              <Field label="Badge (optional)" hint="For example Popular."><input value={pkg.badge} maxLength={30} onChange={(e) => setPkg({ ...pkg, badge: e.target.value })} /></Field>
              <Field label="Shown in the app">
                <select value={pkg.active ? 'yes' : 'no'} onChange={(e) => setPkg({ ...pkg, active: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">Hidden</option></select>
              </Field>
            </div>
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setPkg(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void storePackage()}>{busy ? <Spinner /> : null} Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
