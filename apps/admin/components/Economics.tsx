'use client';

import { useEffect, useMemo, useState } from 'react';

import { DEFAULTS, DEFAULT_PRICE, compute, inr, pct, type Inputs, type PayoutMode, type SessionType } from '@/lib/economics';
import { can, useMe } from './me';
import { Shell } from './Shell';
import { Banner } from './ui';

const STORE_KEY = 'zoove.admin.economics';

type Draft = Record<Exclude<keyof Inputs, 'payoutMode'>, string> & { payoutMode: PayoutMode };

const toDraft = (values: Inputs): Draft => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) out[key] = String(value);
  return out as unknown as Draft;
};

// Typed text to a safe number: empty or invalid is 0, negative is 0, percentages stop at 100.
const read = (text: string, max?: number): number => {
  const value = Math.max(0, Number(text) || 0);
  return max === undefined ? value : Math.min(max, value);
};

const toInputs = (d: Draft): Inputs => ({
  price: read(d.price),
  discount: read(d.discount),
  feePct: read(d.feePct, 100),
  taxPct: read(d.taxPct, 100),
  refundPct: read(d.refundPct, 100),
  payoutMode: d.payoutMode,
  payout: read(d.payout),
  payoutPct: read(d.payoutPct, 100),
  travel: read(d.travel),
  travelPct: read(d.travelPct, 100),
  other: read(d.other),
  otherPct: read(d.otherPct, 100),
  marketing: read(d.marketing),
  marketingPct: read(d.marketingPct, 100),
  sessions: read(d.sessions),
  fixed: read(d.fixed),
  duration: read(d.duration),
  target: read(d.target, 99),
  payoutTarget: read(d.payoutTarget),
});

type NumKey = Exclude<keyof Draft, 'payoutMode'>;

function Num({ label, id, draft, set, step = '1', disabled = false, full = false }: { label: string; id: NumKey; draft: Draft; set: (key: NumKey, value: string) => void; step?: string; disabled?: boolean; full?: boolean }) {
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span>{label}</span>
      <input type="number" inputMode="decimal" min="0" step={step} value={draft[id]} disabled={disabled} onChange={(event) => set(id, event.target.value)} />
    </label>
  );
}

export function Economics({ signOut }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [type, setType] = useState<SessionType>('scheduled');
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULTS));

  // Remember the last numbers in this browser only. Nothing is sent to the server.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { type?: SessionType; draft?: Partial<Draft> };
      if (parsed.type === 'instant' || parsed.type === 'scheduled') setType(parsed.type);
      if (parsed.draft) setDraft((current) => ({ ...current, ...parsed.draft }));
    } catch {
      /* start from the defaults */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ type, draft }));
    } catch {
      /* not remembered */
    }
  }, [type, draft]);

  const inputs = useMemo(() => toInputs(draft), [draft]);
  const r = useMemo(() => compute(inputs), [inputs]);
  const set = (key: NumKey, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const percentMode = draft.payoutMode === 'percent';

  if (!can(me, 'tools.economics')) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Session economics</h1></div></div>
        <Banner tone="info">You do not have access to this tool. Ask an owner to switch it on for you in Team.</Banner>
      </Shell>
    );
  }

  function choose(next: SessionType) {
    setType(next);
    setDraft((current) => ({ ...current, price: String(DEFAULT_PRICE[next]) }));
  }

  function reset() {
    setType('scheduled');
    setDraft(toDraft(DEFAULTS));
  }

  function exportCsv() {
    const rows: [string, string | number][] = [
      ['Zoove session economics', 'Value'],
      ['Session type', type],
      ['Selling price (INR)', inputs.price],
      ['Discount per session (INR)', inputs.discount],
      ['Effective revenue per session', r.net],
      ['Trainer payout method', inputs.payoutMode],
      ['Trainer payout fixed (INR)', inputs.payout],
      ['Trainer payout (% of revenue)', inputs.payoutPct],
      ['Travel / logistics fixed (INR)', inputs.travel],
      ['Travel / logistics (% of revenue)', inputs.travelPct],
      ['Other variable costs fixed (INR)', inputs.other],
      ['Other variable costs (% of revenue)', inputs.otherPct],
      ['Acquisition cost fixed (INR)', inputs.marketing],
      ['Acquisition cost (% of revenue)', inputs.marketingPct],
      ['Payment fee (%)', inputs.feePct],
      ['Tax reserve (%)', inputs.taxPct],
      ['Refund reserve (%)', inputs.refundPct],
      ['Sessions per month', inputs.sessions],
      ['Fixed monthly costs (INR)', inputs.fixed],
      ['Session duration (hours)', inputs.duration],
      ['Target contribution margin (%)', inputs.target],
      ['Total variable costs per session', r.totalCosts],
      ['Contribution per session', r.contribution],
      ['Contribution margin (%)', r.margin],
      ['Monthly effective revenue', r.monthlyRevenue],
      ['Monthly contribution', r.monthlyContribution],
      ['Monthly operating result', r.operatingResult],
      ['Break-even sessions per month', r.breakEven ?? 'Not achievable'],
      ['Selling price needed for target margin', r.requiredPrice === null ? 'Undefined' : r.requiredPrice],
      [percentMode ? 'Maximum trainer payout for target margin (%)' : 'Maximum trainer payout for target margin (INR)', r.maxPayout],
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'zoove-session-economics.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Session economics</h1>
          <p>Model pricing, trainer payout, contribution and monthly break-even. Every number is an editable assumption.</p>
        </div>
        <div className="econ-actions">
          <button className="btn ghost" type="button" onClick={reset}>Reset</button>
          <button className="btn ghost" type="button" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn" type="button" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="econ">
        <div className="econ-col">
          <section className="card">
            <h2>Revenue and pricing</h2>
            <div className="seg-btn" role="group" aria-label="Session type">
              <button type="button" aria-pressed={type === 'scheduled'} onClick={() => choose('scheduled')}>Scheduled</button>
              <button type="button" aria-pressed={type === 'instant'} onClick={() => choose('instant')}>Instant</button>
            </div>
            <div className="fields">
              <Num full label="Session selling price (₹)" id="price" draft={draft} set={set} step="50" />
              <Num label="Discount per session (₹)" id="discount" draft={draft} set={set} />
              <Num label="Payment processing fee (%)" id="feePct" draft={draft} set={set} step="0.1" />
              <Num label="Tax reserve on discounted price (%)" id="taxPct" draft={draft} set={set} step="0.1" />
              <Num label="Refunds and credits (%)" id="refundPct" draft={draft} set={set} step="0.1" />
            </div>
            <p className="hint">The prices here are example inputs, not set Zoove prices. The tax reserve is a planning assumption, not tax advice. Leave it at 0 if tax is accounted for separately.</p>
          </section>

          <section className="card">
            <h2>Trainer and delivery costs</h2>
            <div className="fields">
              <label className="field">
                <span>Trainer payout calculation</span>
                <select value={draft.payoutMode} onChange={(event) => setDraft((current) => ({ ...current, payoutMode: event.target.value as PayoutMode }))}>
                  <option value="flat">Fixed ₹ per session</option>
                  <option value="percent">Percentage of revenue</option>
                </select>
              </label>
              <Num label="Trainer payout per session (₹)" id="payout" draft={draft} set={set} disabled={percentMode} />
              <Num label="Trainer payout (% of revenue)" id="payoutPct" draft={draft} set={set} step="0.1" disabled={!percentMode} />
              <Num label="Travel / logistics per session (₹)" id="travel" draft={draft} set={set} />
              <Num label="Travel / logistics (% of revenue)" id="travelPct" draft={draft} set={set} step="0.1" />
              <Num label="Other variable costs (₹)" id="other" draft={draft} set={set} />
              <Num label="Other variable costs (% of revenue)" id="otherPct" draft={draft} set={set} step="0.1" />
              <Num label="Acquisition cost per session (₹)" id="marketing" draft={draft} set={set} />
              <Num label="Acquisition cost (% of revenue)" id="marketingPct" draft={draft} set={set} step="0.1" />
            </div>
            <p className="hint">Percentages apply to revenue after discount. Travel, other and acquisition costs can each combine a fixed ₹ amount and a percentage. Other costs can include support, supplies, incentives or insurance. Do not count a cost twice.</p>
          </section>

          <section className="card">
            <h2>Monthly assumptions</h2>
            <div className="fields">
              <Num label="Sessions per month" id="sessions" draft={draft} set={set} />
              <Num label="Fixed monthly costs (₹)" id="fixed" draft={draft} set={set} />
              <Num label="Session duration (hours)" id="duration" draft={draft} set={set} step="0.25" />
              <Num label="Target contribution margin (%)" id="target" draft={draft} set={set} />
            </div>
            <p className="hint">Fixed costs include salaries, software, rent and overhead not already in the variable costs.</p>
          </section>

          <section className="card">
            <h2>Trainer payout to compare</h2>
            <div className="fields">
              <Num full label="Trainer payout to compare (₹)" id="payoutTarget" draft={draft} set={set} />
            </div>
            <p className="hint">The maximum payout shown on the right is the mathematical ceiling for your target margin. It is not a recommended payout.</p>
          </section>
        </div>

        <div className="econ-col econ-results">
          <section className="card">
            <h2>Per session</h2>
            <div className="metrics">
              <div className="metric"><div className="k">Revenue after discount</div><div className="v">{inr(r.net)}</div></div>
              <div className="metric"><div className="k">Contribution</div><div className={`v ${r.contribution >= 0 ? 'good' : 'bad'}`}>{inr(r.contribution)}</div><div className="sub">After the variable costs above</div></div>
              <div className="metric"><div className="k">Contribution margin</div><div className="v">{pct(r.margin)}</div><div className="sub">Contribution ÷ revenue</div></div>
              <div className="metric"><div className="k">Trainer payout share</div><div className="v">{pct(r.payoutShare)}</div><div className="sub">Payout ÷ revenue</div></div>
            </div>
            <dl className="rows">
              <div><dt>Trainer payout</dt><dd>{inr(r.payout)}</dd></div>
              <div><dt>Payment processing fee</dt><dd>{inr(r.fee)}</dd></div>
              <div><dt>Tax reserve</dt><dd>{inr(r.tax)}</dd></div>
              <div><dt>Refund and credit reserve</dt><dd>{inr(r.refund)}</dd></div>
              <div><dt>Total variable costs</dt><dd>{inr(r.totalCosts)}</dd></div>
              <div><dt>Contribution per session-hour</dt><dd>{inr(r.perHour)}</dd></div>
            </dl>
            {r.undefinedTarget ? <div className="banner warn" style={{ marginTop: 14, marginBottom: 0 }}>The target price cannot be worked out: all percentage costs plus the target margin must add up to less than 100%.</div> : null}
          </section>

          <section className="card">
            <h2>Monthly</h2>
            <div className="metrics">
              <div className="metric"><div className="k">Revenue</div><div className="v">{inr(r.monthlyRevenue)}</div></div>
              <div className="metric"><div className="k">Contribution</div><div className="v">{inr(r.monthlyContribution)}</div></div>
              <div className="metric"><div className="k">Fixed costs</div><div className="v">{inr(r.fixed)}</div></div>
              <div className="metric"><div className="k">Operating result</div><div className={`v ${r.operatingResult >= 0 ? 'good' : 'bad'}`}>{inr(r.operatingResult)}</div><div className="sub">Before costs not modelled here</div></div>
            </div>
            <div className="callout">
              <div className="k">Break-even volume</div>
              <div className="v">{r.breakEven === null ? 'Not achievable at these inputs' : `${r.breakEven.toLocaleString('en-IN')} sessions`}</div>
              <p>{r.breakEven === null ? 'Contribution is zero or negative. Improve the price or the costs first.' : 'Sessions per month needed to cover the fixed costs.'}</p>
            </div>
          </section>

          <section className="card">
            <h2>Price and payout targets</h2>
            <div className="callout">
              <div className="k">Selling price needed for the target margin</div>
              <div className="v">{r.requiredPrice === null ? 'Check inputs' : inr(r.requiredPrice)}</div>
              <p>Fee, tax and refund rates are taken as percentages of the discounted price, and the other fixed amounts as per session.</p>
            </div>
            <div className="callout">
              <div className="k">Maximum trainer payout for the target margin</div>
              <div className="v">{percentMode ? pct(r.maxPayout) : inr(r.maxPayout)}</div>
              <p>
                {percentMode
                  ? 'The most a trainer can be paid, as a share of revenue, and still reach the target margin.'
                  : `Your comparison payout is ${inr(inputs.payoutTarget)}. ${r.withinCeiling ? 'It is within the ceiling.' : 'It is above the ceiling for this target margin.'}`}
              </p>
            </div>
          </section>

          <p className="muted small">Contribution is not net profit. The monthly operating result subtracts only the fixed costs entered here. Check whether listed prices include tax, and do not count a cost twice. Inputs stay in this browser only and are not sent to the server.</p>
        </div>
      </div>
    </Shell>
  );
}
