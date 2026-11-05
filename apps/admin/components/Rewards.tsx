'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, getRewards, saveReward, switchOffReward, type IssuedReward, type RewardRule, type RewardSide, type RewardsOverview } from '@/lib/api';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner, Field, Spinner } from './ui';

const SIDE_TITLE: Record<RewardSide, string> = { referrer: 'The customer who shares their code', friend: 'The friend who joins with the code' };
const SIDE_HINT: Record<RewardSide, string> = { referrer: 'Given when their friend makes a first booking.', friend: 'Given when they make their first booking.' };
const dayTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const STATE_LABEL: Record<IssuedReward['state'], string> = { unused: 'Not used yet', used: 'Used', expired: 'Expired', switched_off: 'Switched off' };
const STATE_PILL: Record<IssuedReward['state'], string> = { unused: 'in_review', used: 'approved', expired: 'rejected', switched_off: 'rejected' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

type Draft = { enabled: boolean; kind: 'flat' | 'percent'; amount: string; cap: string; days: string };
const toDraft = (r: RewardRule): Draft => ({
  enabled: r.enabled, kind: r.kind ?? 'percent', amount: r.kind === 'percent' ? String(r.percentOff ?? '') : r.flatOffPaise ? String(r.flatOffPaise / 100) : '',
  cap: r.maxDiscountPaise ? String(r.maxDiscountPaise / 100) : '', days: String(r.validDays),
});

export function Rewards({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [data, setData] = useState<RewardsOverview | null>(null);
  const [drafts, setDrafts] = useState<Record<RewardSide, Draft> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);
  const apply = useCallback((d: RewardsOverview) => {
    setData(d);
    const by = Object.fromEntries(d.rules.map((r) => [r.side, toDraft(r)])) as Record<RewardSide, Draft>;
    setDrafts(by);
  }, []);
  const load = useCallback(async () => { try { apply(await getRewards()); setError(null); } catch (err) { setError(handle(err) || null); } }, [apply, handle]);
  useEffect(() => { if (can(me, 'rewards.manage')) void load(); }, [load, me]);

  if (!can(me, 'rewards.manage')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Rewards</h1></div></div>
        <Banner tone="info">You do not have access to rewards. Ask an owner to turn it on for you.</Banner>
      </Shell>
    );
  }

  async function save(side: RewardSide) {
    const d = drafts?.[side]; if (!d) return;
    const amount = Number(d.amount); const cap = d.cap.trim() === '' ? null : Number(d.cap); const days = Number(d.days);
    if (d.enabled) {
      if (!(amount > 0)) return setError(d.kind === 'flat' ? 'Enter how many rupees come off.' : 'Enter the percent that comes off.');
      if (d.kind === 'percent' && (!Number.isInteger(amount) || amount > 100)) return setError('Percent is a whole number from 1 to 100.');
      if (d.kind === 'flat' && amount < 1) return setError('The amount must be at least ₹1.');
    }
    if (cap !== null && !(cap >= 1)) return setError('The cap must be at least ₹1, or empty for no cap.');
    if (!Number.isInteger(days) || days < 1 || days > 365) return setError('Valid for must be 1 to 365 days.');
    setBusy(true); setError(null);
    try {
      apply(await saveReward(side, {
        enabled: d.enabled, kind: d.kind, flatOffPaise: d.kind === 'flat' && amount > 0 ? Math.round(amount * 100) : null,
        percentOff: d.kind === 'percent' && amount > 0 ? amount : null, maxDiscountPaise: d.kind === 'percent' && cap !== null ? Math.round(cap * 100) : null, validDays: days,
      }));
      setSaved(d.enabled ? 'Reward saved and switched on' : 'Reward saved and switched off');
    } catch (err) { const m = handle(err); if (m) setError(m); } finally { setBusy(false); }
  }
  async function off(id: string) {
    try { apply(await switchOffReward(id)); setSaved('Reward switched off'); } catch (err) { setError(handle(err) || null); }
  }
  const edit = (side: RewardSide, patch: Partial<Draft>) => drafts && setDrafts({ ...drafts, [side]: { ...drafts[side], ...patch } });

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Rewards</h1>
          <p>What a referral earns. When a friend makes their first booking, a one-time discount code is made automatically for each side, saved here, emailed and shown in their app. Change the percent or the days here at any time. It only affects codes made after you save. Both sides start switched off.</p>
        </div>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {saved && !error ? <Banner tone="good">{saved}.</Banner> : null}
      {!data && !error ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : null}

      {data && drafts ? (
        <>
          <div className="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="metric panel" style={{ padding: 14 }}><b>{data.stats.signedUp}</b><div className="sub">friends joined with a code</div></div>
            <div className="metric panel" style={{ padding: 14 }}><b>{data.stats.booked}</b><div className="sub">of them booked</div></div>
            <div className="metric panel" style={{ padding: 14 }}><b>{data.stats.rewardsGiven}</b><div className="sub">rewards given</div></div>
          </div>

          {(['referrer', 'friend'] as RewardSide[]).map((side) => {
            const d = drafts[side];
            return (
              <section key={side} className="panel" style={{ padding: 18, marginBottom: 16 }}>
                <h2 style={{ marginTop: 0 }}>{SIDE_TITLE[side]}</h2>
                <p className="muted small">{SIDE_HINT[side]} Changing this affects future referrals only.</p>
                <div className="fields">
                  <Field label="Reward"><select value={d.enabled ? 'on' : 'off'} onChange={(e) => edit(side, { enabled: e.target.value === 'on' })}><option value="off">Switched off</option><option value="on">Switched on</option></select></Field>
                  <Field label="Type"><select value={d.kind} onChange={(e) => edit(side, { kind: e.target.value as 'flat' | 'percent' })}><option value="flat">Flat amount off</option><option value="percent">Percent off</option></select></Field>
                  <Field label={d.kind === 'flat' ? 'Amount off (₹)' : 'Percent off (%)'}><input inputMode="decimal" value={d.amount} onChange={(e) => edit(side, { amount: e.target.value })} /></Field>
                  {d.kind === 'percent' ? <Field label="Most it can take off (₹, optional)"><input inputMode="decimal" value={d.cap} onChange={(e) => edit(side, { cap: e.target.value })} /></Field> : null}
                  <Field label="Valid for (days)" hint="Counted from the day it is given."><input inputMode="numeric" value={d.days} onChange={(e) => edit(side, { days: e.target.value })} /></Field>
                </div>
                <div className="actions" style={{ maxWidth: 220 }}>
                  <button className="btn" type="button" disabled={busy} onClick={() => void save(side)}>{busy ? <Spinner /> : null} Save</button>
                </div>
              </section>
            );
          })}

          <h2>Rewards given</h2>
          {data.issued.length === 0 ? <Banner tone="info">No rewards given yet.</Banner> : (
            <div className="panel tablewrap">
              <table className="list">
                <thead><tr><th>Customer</th><th>For</th><th>Code</th><th>Status</th><th>Used on</th><th /></tr></thead>
                <tbody>
                  {data.issued.map((r) => (
                    <tr key={r.id}>
                      <td>{r.customer}<div className="sub muted small">{day(r.createdAt)}</div></td>
                      <td>{r.side === 'referrer' ? 'Sharing their code' : 'Joining with a code'}</td>
                      <td><code>{r.code}</code> <span className="muted small">{r.worth}</span>{r.expiresAt ? <div className="sub muted small">until {day(r.expiresAt)}</div> : null}</td>
                      <td><span className={`pill ${STATE_PILL[r.state]}`}>{STATE_LABEL[r.state]}</span></td>
                      <td>{r.usedAt ? dayTime(r.usedAt) : <span className="muted">-</span>}</td>
                      <td>{r.state === 'unused' ? <button className="btn ghost" type="button" onClick={() => void off(r.id)}>Switch off</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Shell>
  );
}
