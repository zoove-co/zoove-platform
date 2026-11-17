'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getTrainerPerformance, setTrainerPayout, type TrainerPayouts, type EarnSlice, type TrainerPerformance as Data, type TrainerSessionItem } from '@/lib/api';
import { can, useMe } from './me';
import { Banner, CallLink, Spinner } from './ui';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const PEOPLE: Record<string, string> = { personal: 'Personal', duo: 'Duo', loved_one: 'Loved one', group: 'Group' };
const PAYOUT_KINDS: [keyof TrainerPayouts, string][] = [['personal', 'Personal'], ['duo', 'Duo'], ['loved_one', 'Loved one (Family)'], ['group', 'Group']];

type Tab = 'live' | 'upcoming' | 'past';

function Bars({ items, unit }: { items: { label: string; sessions: number; earnedPaise: number }[]; unit: 'earned' | 'sessions' }) {
  const value = (i: { sessions: number; earnedPaise: number }) => (unit === 'earned' ? i.earnedPaise : i.sessions);
  const max = Math.max(1, ...items.map(value));
  return (
    <div className="bars" role="img" aria-label={unit === 'earned' ? 'Earnings per period' : 'Sessions per period'}>
      {items.map((i) => (
        <div className="col" key={i.label} title={`${i.label}: ${i.sessions} session${i.sessions === 1 ? '' : 's'}, ${rupees(i.earnedPaise)}`}>
          <span className="n">{value(i) ? (unit === 'earned' ? rupees(i.earnedPaise) : i.sessions) : ''}</span>
          <div className={`bar${value(i) ? '' : ' zero'}`} style={{ height: `${Math.max(3, Math.round((value(i) / max) * 100))}%` }} />
          <span className="l">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function Slices({ title, rows, known }: { title: string; rows: EarnSlice[]; known: boolean }) {
  const total = rows.reduce((sum, r) => sum + (known ? r.earnedPaise : r.sessions), 0) || 1;
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {rows.length === 0 ? <p className="muted small" style={{ marginTop: 0 }}>Nothing yet.</p> : (
        <div className="slices">
          {rows.map((r) => (
            <div className="slice" key={r.name}>
              <div className="row"><span>{r.name}</span><span className="muted">{r.sessions} session{r.sessions === 1 ? '' : 's'}{known ? ` · ${rupees(r.earnedPaise)}` : ''}</span></div>
              <div className="track"><div className="fill" style={{ width: `${Math.round(((known ? r.earnedPaise : r.sessions) / total) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One trainer for ops: figures (day, week, month, lifetime), what they earn from which sessions, and every live, upcoming and past session
// (each opens in the Sessions tab; each customer opens in the Customers tab).
export function TrainerPerformance({ applicationId, phone, expired }: { applicationId: string; phone: string | null; expired: () => void }) {
  const me = useMe();
  const canSessions = can(me, 'sessions.manage');
  const canCustomers = can(me, 'customers.view');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [chart, setChart] = useState<'weekly' | 'monthly'>('weekly');
  const [amounts, setAmounts] = useState<Record<keyof TrainerPayouts, string>>({ personal: '', duo: '', loved_one: '', group: '' });
  const filled = useRef(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getTrainerPerformance(applicationId);
      setData(result);
      setError(null);
      // Fill the boxes from the saved amounts once, so what an owner is typing is never overwritten by a refresh.
      if (!filled.current) {
        filled.current = true;
        const pick = (v: number | null) => (v === null ? '' : String(v / 100));
        setAmounts({ personal: pick(result.insights.payouts.personal), duo: pick(result.insights.payouts.duo), loved_one: pick(result.insights.payouts.loved_one), group: pick(result.insights.payouts.group) });
      }
      setTab((current) => (current === 'upcoming' && result.live.length > 0 && result.upcoming.length === 0 ? 'live' : current));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return expired();
      setError(err instanceof ApiError ? err.message : 'Could not load this trainer’s sessions.');
    }
  }, [applicationId, expired]);
  useEffect(() => { void load(); }, [load]);

  async function savePayout() {
    const toPaise = (text: string): number | null | 'bad' => {
      if (text.trim() === '') return null;
      const n = Number(text);
      return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n * 100) : 'bad';
    };
    const next = { personal: toPaise(amounts.personal), duo: toPaise(amounts.duo), loved_one: toPaise(amounts.loved_one), group: toPaise(amounts.group) };
    if (Object.values(next).includes('bad')) { setError('Enter amounts between ₹0 and ₹10,000, or leave a box empty.'); return; }
    setSaving(true); setNotice(null);
    try {
      const r = await setTrainerPayout(next as TrainerPayouts);
      setNotice(r.filledIn > 0 ? `Saved. ${r.filledIn} finished session${r.filledIn === 1 ? '' : 's'} that had no amount now carry it.` : 'Saved. It applies to sessions finished from now on.');
      setError(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return expired();
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally { setSaving(false); }
  }

  if (error && !data) return <Banner tone="bad">{error}</Banner>;
  if (!data) return <div className="center" style={{ padding: 30 }}><Spinner /></div>;
  const { insights: i } = data;
  const known = i.earningsKnown;
  const list: TrainerSessionItem[] = data[tab];
  const tile = (key: 'today' | 'week' | 'month' | 'lifetime', label: string) => (
    <div className="tile" key={key}>
      <div className="k">{label}</div>
      <div className="v">{known ? rupees(i.periods[key].earnedPaise) : `${i.periods[key].sessions}`}</div>
      <div className="s">{known ? `${i.periods[key].sessions} session${i.periods[key].sessions === 1 ? '' : 's'}` : `session${i.periods[key].sessions === 1 ? '' : 's'} done`}{i.periods[key].valuePaise !== undefined && known ? ` · customers paid ${rupees(i.periods[key].valuePaise ?? 0)}` : ''}</div>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <CallLink phone={phone} label="Call trainer" />
        {i.rating.average !== null ? <span className="pill approved">★ {i.rating.average} · {i.rating.count} rating{i.rating.count === 1 ? '' : 's'}</span> : <span className="muted small">No ratings yet</span>}
      </div>

      {!known ? <Banner tone="info">{me?.isOwner ? 'No payout amount is set yet, so earnings are not shown. Set it below.' : 'No payout amount is set yet, so only session counts are shown. An owner can set the amount.'}</Banner> : null}
      <div className="earn">
        {tile('today', 'Today')}{tile('week', 'This week')}{tile('month', 'This month')}{tile('lifetime', 'Lifetime')}
      </div>

      <div className="tabrow" role="group" aria-label="Chart">
        <button type="button" aria-pressed={chart === 'weekly'} onClick={() => setChart('weekly')}>Last 8 weeks</button>
        <button type="button" aria-pressed={chart === 'monthly'} onClick={() => setChart('monthly')}>Last 6 months</button>
      </div>
      <Bars items={chart === 'weekly' ? i.weekly : i.monthly} unit={known ? 'earned' : 'sessions'} />
      <p className="muted small" style={{ marginTop: 4 }}>{chart === 'weekly' ? 'Each bar is a week starting on the date shown (Monday).' : 'Each bar is a calendar month.'} Times are India time.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 8 }}>
        <Slices title="By service" rows={i.byService} known={known} />
        <Slices title="By session type" rows={i.byParticipant} known={known} />
        <Slices title="Instant or scheduled" rows={i.byMode} known={known} />
      </div>

      {me?.isOwner ? (
        <div className="panel" style={{ padding: 14, margin: '6px 0 16px' }}>
          <strong>What a trainer earns per completed session</strong>
          <p className="muted small" style={{ margin: '4px 0 10px' }}>One amount for each kind of session, the same for every trainer and for instant or scheduled. Each session keeps the amount that applied when it was finished, so changing it never rewrites past earnings. Finished sessions that have no amount yet get the amount for their kind when you save it. A kind left empty earns nothing until you set it.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
            {PAYOUT_KINDS.map(([key, label]) => (
              <label key={key} className="small" style={{ display: 'grid', gap: 4 }}>
                {label}
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>₹</span>
                  <input type="number" inputMode="decimal" min="0" max="10000" step="1" value={amounts[key]} onChange={(e) => setAmounts((cur) => ({ ...cur, [key]: e.target.value }))} aria-label={`Payout for ${label} in rupees`} style={{ width: '100%', minWidth: 0 }} />
                </span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn" type="button" disabled={saving} onClick={() => void savePayout()}>{saving ? <Spinner /> : null} Save</button>
          </div>
          {notice ? <p className="small" style={{ margin: '8px 0 0', color: 'var(--green)' }}>{notice}</p> : null}
        </div>
      ) : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <h3 style={{ marginBottom: 6 }}>Sessions</h3>
      <div className="tabrow" role="group" aria-label="Sessions">
        <button type="button" aria-pressed={tab === 'live'} onClick={() => setTab('live')}>Active ({data.live.length})</button>
        <button type="button" aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>Upcoming ({data.upcoming.length})</button>
        <button type="button" aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Past ({data.past.length}{i.periods.lifetime.sessions > data.past.length ? '+' : ''})</button>
      </div>
      {list.length === 0 ? <div className="empty-note">{tab === 'live' ? 'No session is on right now.' : tab === 'upcoming' ? 'Nothing coming up.' : 'No finished sessions yet.'}</div> : (
        <div className="tablewrap">
          <table className="list">
            <thead><tr><th>Session</th><th>When</th><th>Customer</th>{tab === 'past' ? <th>Earned</th> : null}<th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.sessionCode}</b><div className="sub muted small">{s.serviceName} · {s.formatName} · {PEOPLE[s.participant] ?? s.participant}</div></td>
                  <td>{s.startsAt ? stamp(s.startsAt) : s.whenLabel}{s.area ? <div className="sub muted small">{s.area}</div> : null}</td>
                  <td>{canCustomers ? <Link className="xlink" href={`/customers?open=${s.customerId}`}>{s.customerName}</Link> : s.customerName}</td>
                  {tab === 'past' ? <td>{s.earnedPaise !== null ? rupees(s.earnedPaise) : '—'}{s.rating !== null ? <div className="sub muted small">{'★'.repeat(s.rating)}</div> : null}</td> : null}
                  <td>{canSessions ? <Link className="btn ghost" href={`/sessions?open=${s.id}`}>Open</Link> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
