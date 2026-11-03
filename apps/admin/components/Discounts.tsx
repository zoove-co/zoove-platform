'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, createDiscountCode, disableDiscountCode, listDiscountCodes, type DiscountCode, type DiscountReason, type NewDiscountCode } from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Field, Spinner } from './ui';

const REASONS: { value: DiscountReason; label: string }[] = [
  { value: 'goodwill', label: 'Goodwill' },
  { value: 'emergency', label: 'Emergency / service issue' },
  { value: 'misconduct', label: 'Misconduct make-good' },
  { value: 'referral', label: 'Referral' },
  { value: 'promo', label: 'Promotion' },
  { value: 'other', label: 'Other' },
];
const reasonLabel = (value: DiscountReason) => REASONS.find((item) => item.value === value)?.label ?? value;
const STATUS_LABEL: Record<DiscountCode['status'], string> = { active: 'Active', expired: 'Expired', used_up: 'Used up', disabled: 'Switched off' };
const STATUS_PILL: Record<DiscountCode['status'], string> = { active: 'approved', expired: 'changes_requested', used_up: 'in_review', disabled: 'rejected' };

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const offLabel = (code: DiscountCode) => (code.kind === 'percent' ? `${code.percentOff}% off${code.maxDiscountPaise ? ` (up to ${rupees(code.maxDiscountPaise)})` : ''}` : `${rupees(code.flatOffPaise ?? 0)} off`);
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

type Draft = {
  kind: 'percent' | 'flat';
  amount: string; // percent, or rupees
  cap: string; // rupees
  reason: DiscountReason;
  note: string;
  customerEmail: string;
  code: string;
  maxRedemptions: string;
  minOrder: string; // rupees
  appliesTo: 'any' | 'session' | 'package';
  expiryDays: string;
};
const EMPTY: Draft = { kind: 'percent', amount: '', cap: '', reason: 'goodwill', note: '', customerEmail: '', code: '', maxRedemptions: '1', minOrder: '', appliesTo: 'any', expiryDays: '' };

const toPaise = (rupeeText: string): number => Math.round(Number(rupeeText) * 100);
const isWhole = (text: string, min: number, max: number) => /^\d+$/.test(text.trim()) && Number(text) >= min && Number(text) <= max;

function validate(draft: Draft): string | null {
  if (draft.kind === 'percent' ? !isWhole(draft.amount, 1, 100) : !(Number(draft.amount) >= 1 && Number(draft.amount) <= 100_000)) {
    return draft.kind === 'percent' ? 'Percent off must be a whole number from 1 to 100.' : 'Enter the rupees off (1 to 1,00,000).';
  }
  if (draft.kind === 'percent' && draft.cap && !(Number(draft.cap) >= 1)) return 'The cap must be at least ₹1.';
  if (!isWhole(draft.maxRedemptions, 1, 100_000)) return 'Total uses must be a whole number from 1 to 1,00,000.';
  if (draft.code.trim() && !/^[A-Za-z0-9]{4,20}$/.test(draft.code.trim())) return 'A made-up code is 4 to 20 letters and numbers, no spaces.';
  if (draft.customerEmail.trim() && !/^\S+@\S+\.\S+$/.test(draft.customerEmail.trim())) return 'Enter the customer’s email, or leave it empty.';
  if (draft.expiryDays && !isWhole(draft.expiryDays, 1, 3650)) return 'Valid for must be a whole number of days.';
  return null;
}

function toInput(draft: Draft): NewDiscountCode {
  const input: NewDiscountCode = {
    kind: draft.kind,
    reason: draft.reason,
    maxRedemptions: Number(draft.maxRedemptions),
    // One use per customer unless the code is for many people and meant to be reused (not offered here).
    perUserLimit: 1,
    minOrderPaise: draft.minOrder ? toPaise(draft.minOrder) : 0,
    appliesTo: draft.appliesTo,
  };
  if (draft.kind === 'percent') {
    input.percentOff = Number(draft.amount);
    if (draft.cap) input.maxDiscountPaise = toPaise(draft.cap);
  } else {
    input.flatOffPaise = toPaise(draft.amount);
  }
  if (draft.note.trim()) input.note = draft.note.trim();
  if (draft.customerEmail.trim()) input.customerEmail = draft.customerEmail.trim();
  if (draft.code.trim()) input.code = draft.code.trim().toUpperCase();
  if (draft.expiryDays) input.expiresAt = new Date(Date.now() + Number(draft.expiryDays) * 86_400_000).toISOString();
  return input;
}

export function Discounts({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<DiscountCode | null>(null);
  const [copied, setCopied] = useState(false);

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
      setCodes(await listDiscountCodes());
      setError(null);
    } catch (err) {
      setError(handle(err) || null);
    }
  }, [handle]);

  useEffect(() => {
    if (!can(me, 'discounts.manage')) return;
    void load();
  }, [load, me]);

  if (!can(me, 'discounts.manage')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Discount codes</h1></div></div>
        <Banner tone="info">You do not have access to discount codes. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function save() {
    const problem = validate(draft);
    if (problem) return setFormError(problem);
    setBusy(true);
    setFormError(null);
    try {
      const made = await createDiscountCode(toInput(draft));
      setCreating(false);
      setCreated(made);
      setCopied(false);
      await load();
    } catch (err) {
      const message = handle(err);
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  async function switchOff(code: DiscountCode) {
    try {
      await disableDiscountCode(code.id);
      await load();
    } catch (err) {
      setError(handle(err) || null);
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* the code is shown on screen, it can be copied by hand */
    }
  };

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Discount codes</h1>
          <p>Make a code, give it to a customer, and they enter it at checkout. The price is checked and reduced by the server.</p>
        </div>
        <button className="btn" type="button" onClick={() => { setDraft(EMPTY); setFormError(null); setCreating(true); }}>New code</button>
      </div>

      {created ? (
        <Banner tone="good">
          Code <b style={{ letterSpacing: 1 }}>{created.code}</b> is ready: {offLabel(created)}.{' '}
          {created.customerEmail ? `It is only for ${created.customerEmail}, and they have a notification in the app. ` : 'Give it to the customer. '}
          <button className="chipbtn" type="button" onClick={() => void copy(created.code)}>{copied ? 'Copied' : 'Copy code'}</button>
        </Banner>
      ) : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      {!codes && !error ? (
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      ) : codes && codes.length === 0 ? (
        <Banner tone="info">No codes yet. Press “New code” to make the first one.</Banner>
      ) : codes ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead>
              <tr><th>Code</th><th>Discount</th><th className="hide-sm">Why</th><th className="hide-sm">For</th><th>Used</th><th className="hide-sm">Expires</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id}>
                  <td><b style={{ letterSpacing: 1 }}>{code.code}</b><div className="sub muted small">{when(code.createdAt)}{code.createdBy ? ` · ${code.createdBy}` : ''}</div></td>
                  <td>{offLabel(code)}{code.minOrderPaise ? <div className="sub muted small">on {rupees(code.minOrderPaise)}+</div> : null}</td>
                  <td className="hide-sm">{reasonLabel(code.reason)}{code.note ? <div className="sub muted small">{code.note}</div> : null}</td>
                  <td className="hide-sm muted">{code.customerEmail ?? 'Anyone with the code'}</td>
                  <td>{code.used} / {code.maxRedemptions}</td>
                  <td className="hide-sm muted">{code.expiresAt ? when(code.expiresAt) : 'Never'}</td>
                  <td><span className={`pill ${STATUS_PILL[code.status]}`}>{STATUS_LABEL[code.status]}</span></td>
                  <td>{code.status === 'active' ? <button className="btn ghost" type="button" onClick={() => void switchOff(code)}>Switch off</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {creating ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet wide">
            <h2>New discount code</h2>
            <p className="muted">The code is saved and can be used at checkout straight away. Every code you make is recorded with your name.</p>

            <div className="fields">
              <Field label="Type" group>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="chipbtn" aria-pressed={draft.kind === 'percent'} onClick={() => setDraft({ ...draft, kind: 'percent' })}>Percent off</button>
                  <button type="button" className="chipbtn" aria-pressed={draft.kind === 'flat'} onClick={() => setDraft({ ...draft, kind: 'flat' })}>Rupees off</button>
                </div>
              </Field>
              <Field label={draft.kind === 'percent' ? 'Percent off' : 'Rupees off'} hint={draft.kind === 'percent' ? 'For example 50 for half price.' : 'Taken off the session price.'}>
                <input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </Field>
              {draft.kind === 'percent' ? (
                <Field label="Most it can take off (₹, optional)" hint="Stops a big order getting a huge discount.">
                  <input inputMode="decimal" value={draft.cap} onChange={(e) => setDraft({ ...draft, cap: e.target.value })} />
                </Field>
              ) : null}
              <Field label="Reason">
                <select value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value as DiscountReason })}>
                  {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Only for this customer (email, optional)" hint="They must have signed in to the app. They get a notification with the code. Leave empty for anyone.">
                <input type="email" value={draft.customerEmail} onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} />
              </Field>
              <Field label="How many times it can be used" hint="Across all customers. Each customer can use it once.">
                <input inputMode="numeric" value={draft.maxRedemptions} onChange={(e) => setDraft({ ...draft, maxRedemptions: e.target.value })} />
              </Field>
              <Field label="Valid for (days, optional)" hint="Empty means it never expires.">
                <input inputMode="numeric" value={draft.expiryDays} onChange={(e) => setDraft({ ...draft, expiryDays: e.target.value })} />
              </Field>
              <Field label="Smallest order (₹, optional)">
                <input inputMode="decimal" value={draft.minOrder} onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })} />
              </Field>
              <Field label="Works on">
                <select value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value as Draft['appliesTo'] })}>
                  <option value="any">Sessions and packages</option>
                  <option value="session">Sessions only</option>
                  <option value="package">Packages only</option>
                </select>
              </Field>
              <Field label="Code (optional)" hint="Leave empty for a random one like K7QM2XPA. Or type your own, 4 to 20 letters and numbers.">
                <input value={draft.code} maxLength={20} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
              </Field>
              <div className="field full">
                <label>
                  <span>Note (only the team sees it)</span>
                  <input value={draft.note} maxLength={500} placeholder="For example: coach was 40 minutes late on 4 Nov" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                </label>
              </div>
            </div>

            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : null} Create code</button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
