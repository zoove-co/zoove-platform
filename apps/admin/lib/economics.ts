// Session economics model, ported from Pratik's calculator (index.html, Oct 2026). The maths is unchanged.
// Every number the person types is a planning assumption, not a confirmed Zoove price, cost or payout.

export type PayoutMode = 'flat' | 'percent';

export type Inputs = {
  price: number;
  discount: number;
  feePct: number;
  taxPct: number;
  refundPct: number;
  payoutMode: PayoutMode;
  payout: number;
  payoutPct: number;
  travel: number;
  travelPct: number;
  other: number;
  otherPct: number;
  marketing: number;
  marketingPct: number;
  sessions: number;
  fixed: number;
  duration: number;
  target: number;
  payoutTarget: number;
};

export type SessionType = 'scheduled' | 'instant';

// Pratik's starting values. The scheduled and instant prices are his example inputs, not set prices.
export const DEFAULT_PRICE: Record<SessionType, number> = { scheduled: 1700, instant: 1900 };

export const DEFAULTS: Inputs = {
  price: 1700,
  discount: 0,
  feePct: 2,
  taxPct: 0,
  refundPct: 0,
  payoutMode: 'flat',
  payout: 1100,
  payoutPct: 0,
  travel: 100,
  travelPct: 0,
  other: 50,
  otherPct: 0,
  marketing: 0,
  marketingPct: 0,
  sessions: 1000,
  fixed: 0,
  duration: 1,
  target: 30,
  payoutTarget: 1100,
};

export type Results = {
  net: number;
  payout: number;
  travel: number;
  other: number;
  marketing: number;
  fee: number;
  tax: number;
  refund: number;
  totalCosts: number;
  contribution: number;
  margin: number;
  payoutShare: number | null;
  perHour: number | null;
  monthlyRevenue: number;
  monthlyContribution: number;
  fixed: number;
  operatingResult: number;
  breakEven: number | null;
  requiredPrice: number | null;
  maxPayout: number;
  withinCeiling: boolean;
  undefinedTarget: boolean;
};

export function compute(i: Inputs): Results {
  const net = Math.max(0, i.price - i.discount);
  const percentMode = i.payoutMode === 'percent';
  const payout = percentMode ? (net * i.payoutPct) / 100 : i.payout;
  const travel = i.travel + (net * i.travelPct) / 100;
  const other = i.other + (net * i.otherPct) / 100;
  const marketing = i.marketing + (net * i.marketingPct) / 100;
  const fee = (net * i.feePct) / 100;
  const tax = (net * i.taxPct) / 100;
  const refund = (net * i.refundPct) / 100;
  const totalCosts = payout + travel + other + marketing + fee + tax + refund;
  const contribution = net - totalCosts;
  const margin = net > 0 ? (contribution / net) * 100 : 0;

  const target = Math.min(99, i.target);
  const monthlyContribution = contribution * i.sessions;
  const operatingResult = monthlyContribution - i.fixed;
  const breakEven = contribution > 0 ? Math.ceil(i.fixed / contribution) : null;

  const percentCosts = i.feePct + i.taxPct + i.refundPct + i.travelPct + i.otherPct + i.marketingPct + (percentMode ? i.payoutPct : 0);
  const fixedCosts = (percentMode ? 0 : i.payout) + i.travel + i.other + i.marketing;
  const denominator = 1 - percentCosts / 100 - target / 100;
  const requiredPrice = denominator > 0 ? fixedCosts / denominator + i.discount : null;

  const ceiling =
    net - (net * (i.feePct + i.taxPct + i.refundPct)) / 100 - (i.travel + (net * i.travelPct) / 100) - (i.other + (net * i.otherPct) / 100) - (i.marketing + (net * i.marketingPct) / 100) - (net * target) / 100;
  const maxPayout = Math.max(0, percentMode ? (net > 0 ? (ceiling / net) * 100 : 0) : ceiling);

  return {
    net,
    payout,
    travel,
    other,
    marketing,
    fee,
    tax,
    refund,
    totalCosts,
    contribution,
    margin,
    payoutShare: net > 0 ? (payout / net) * 100 : null,
    perHour: i.duration > 0 ? contribution / i.duration : null,
    monthlyRevenue: net * i.sessions,
    monthlyContribution,
    fixed: i.fixed,
    operatingResult,
    breakEven,
    requiredPrice,
    maxPayout,
    withinCeiling: i.payoutTarget <= ceiling,
    undefinedTarget: percentCosts + target >= 100,
  };
}

export const inr = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export const pct = (value: number | null): string => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`);
